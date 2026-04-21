#pragma once

#include <gnuradio-4.0/Block.hpp>
#include <gnuradio-4.0/BlockRegistry.hpp>

#include <httplib.h>

#include <algorithm>
#include <concepts>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <limits>
#include <memory>
#include <mutex>
#include <span>
#include <sstream>
#include <string>
#include <string_view>
#include <thread>
#include <utility>
#include <vector>

namespace gr::studio {

namespace detail {

template<typename T>
concept SupportedAudioSample = std::same_as<T, float>;

template<SupportedAudioSample T>
class AudioWindow {
public:
    explicit AudioWindow(std::size_t channels = 1UZ, std::size_t window_size = 2048UZ) {
        configure(channels, window_size);
    }

    void configure(std::size_t channels, std::size_t window_size) {
        std::lock_guard lock(_mutex);
        _channels = std::max<std::size_t>(1UZ, channels);
        _windowSize = std::max<std::size_t>(1UZ, window_size);
        _ring.assign(_channels * _windowSize, T{});
        _pending.clear();
        _writeIndex = 0UZ;
        _filled = 0UZ;
    }

    void pushInterleaved(std::span<const T> input) {
        if (input.empty()) {
            return;
        }

        std::lock_guard lock(_mutex);
        _pending.insert(_pending.end(), input.begin(), input.end());

        const std::size_t frames = _pending.size() / _channels;
        for (std::size_t frame = 0UZ; frame < frames; ++frame) {
            for (std::size_t channel = 0UZ; channel < _channels; ++channel) {
                const std::size_t srcIndex = frame * _channels + channel;
                _ring[channel * _windowSize + _writeIndex] = _pending[srcIndex];
            }

            _writeIndex = (_writeIndex + 1UZ) % _windowSize;
            if (_filled < _windowSize) {
                ++_filled;
            }
        }

        const std::size_t consumed = frames * _channels;
        if (consumed > 0UZ) {
            _pending.erase(_pending.begin(), _pending.begin() + static_cast<std::ptrdiff_t>(consumed));
        }
    }

    [[nodiscard]] std::string snapshotJson(std::uint32_t sample_rate) const {
        std::vector<std::vector<T>> perChannel;
        std::size_t channelCount = 0UZ;
        std::size_t samplesPerChannel = 0UZ;

        {
            std::lock_guard lock(_mutex);
            channelCount = _channels;
            samplesPerChannel = _filled;
            perChannel.assign(channelCount, std::vector<T>(samplesPerChannel));

            const std::size_t oldest = (_filled == _windowSize) ? _writeIndex : 0UZ;
            for (std::size_t channel = 0UZ; channel < channelCount; ++channel) {
                for (std::size_t index = 0UZ; index < samplesPerChannel; ++index) {
                    const std::size_t ringIndex = (oldest + index) % _windowSize;
                    perChannel[channel][index] = _ring[channel * _windowSize + ringIndex];
                }
            }
        }

        std::ostringstream os;
        os.precision(9);
        os << "{\"sample_type\":\"float32\",";
        os << "\"sample_rate\":" << sample_rate << ",";
        os << "\"channels\":" << channelCount << ",";
        os << "\"samples_per_channel\":" << samplesPerChannel << ",";
        os << "\"layout\":\"channels_first\",";
        os << "\"data\":[";
        for (std::size_t channel = 0UZ; channel < channelCount; ++channel) {
            if (channel > 0UZ) {
                os << ',';
            }
            os << '[';
            for (std::size_t index = 0UZ; index < samplesPerChannel; ++index) {
                if (index > 0UZ) {
                    os << ',';
                }
                os << perChannel[channel][index];
            }
            os << ']';
        }
        os << "]}";
        return os.str();
    }

private:
    mutable std::mutex _mutex;
    std::size_t _channels = 1UZ;
    std::size_t _windowSize = 2048UZ;
    std::vector<T> _ring;
    std::vector<T> _pending;
    std::size_t _writeIndex = 0UZ;
    std::size_t _filled = 0UZ;
};

struct ParsedHttpEndpoint {
    std::string host;
    std::uint16_t port;
    std::string path;
};

inline std::string normalizeSnapshotPath(const std::string& rawPath) {
    if (rawPath.empty()) {
        return "/snapshot";
    }
    if (rawPath.starts_with('/')) {
        return rawPath;
    }
    return "/" + rawPath;
}

inline ParsedHttpEndpoint parseHttpEndpoint(const std::string& endpoint) {
    std::string remaining = endpoint;
    for (const std::string_view prefix : {"http://", "https://", "ws://", "wss://"}) {
        if (remaining.starts_with(prefix)) {
            remaining.erase(0UZ, prefix.size());
            break;
        }
    }

    const std::size_t slash = remaining.find('/');
    const std::string hostPort = slash == std::string::npos ? remaining : remaining.substr(0UZ, slash);
    const std::string path = slash == std::string::npos ? "/snapshot" : normalizeSnapshotPath(remaining.substr(slash));

    std::string host = "127.0.0.1";
    std::uint16_t port = 8080U;
    if (!hostPort.empty()) {
        const std::size_t colon = hostPort.rfind(':');
        if (colon == std::string::npos) {
            host = hostPort;
        } else {
            host = hostPort.substr(0UZ, colon);
            const std::string portText = hostPort.substr(colon + 1UZ);
            if (!portText.empty()) {
                const int parsed = std::stoi(portText);
                if (parsed > 0 && parsed <= static_cast<int>(std::numeric_limits<std::uint16_t>::max())) {
                    port = static_cast<std::uint16_t>(parsed);
                }
            }
        }
    }

    if (host.empty()) {
        host = "127.0.0.1";
    }

    return ParsedHttpEndpoint{
        .host = host,
        .port = port,
        .path = path,
    };
}

class SnapshotHttpService {
public:
    using JsonProvider = std::function<std::string()>;

    ~SnapshotHttpService() { stop(); }

    [[nodiscard]] bool start(const ParsedHttpEndpoint& endpoint, JsonProvider provider) {
        stop();

        _host = endpoint.host;
        _port = endpoint.port;
        _path = endpoint.path;
        _provider = std::move(provider);
        _boundPort = 0U;

        _server = std::make_unique<httplib::Server>();
        _server->Get(_path, [this](const httplib::Request&, httplib::Response& res) {
            res.set_header("Cache-Control", "no-store");
            res.set_content(_provider ? _provider() : std::string("{}"), "application/json");
        });

        const int bound = _server->bind_to_port(_host, static_cast<int>(_port));
        if (bound < 0) {
            _server.reset();
            return false;
        }
        _boundPort = static_cast<std::uint16_t>(bound);

        _serverThread = std::thread([this]() {
            if (_server) {
                _server->listen_after_bind();
            }
        });
        return true;
    }

    void stop() {
        if (_server) {
            _server->stop();
        }
        if (_serverThread.joinable()) {
            _serverThread.join();
        }
        _server.reset();
    }

private:
    std::string _host{"127.0.0.1"};
    std::uint16_t _port{8080U};
    std::uint16_t _boundPort{0U};
    std::string _path{"/snapshot"};
    JsonProvider _provider;
    std::unique_ptr<httplib::Server> _server;
    std::thread _serverThread;
};

inline bool isHttpTransport(const std::string& transport) {
    return transport == "http_snapshot" || transport == "http_poll";
}

} // namespace detail

GR_REGISTER_BLOCK("gr::studio::StudioAudioMonitor", gr::studio::StudioAudioMonitor, ([T]), [ float ])

template<detail::SupportedAudioSample T>
struct StudioAudioMonitor : Block<StudioAudioMonitor<T>> {
    using Description = Doc<"@brief Studio audio monitor sink with explicit transport configuration.">;

    PortIn<T> in;

    Annotated<std::string, "transport", Doc<"Data-plane transport mode">, Visible> transport = "http_poll";
    Annotated<std::string, "endpoint", Doc<"Transport endpoint URL/path">, Visible> endpoint = "http://127.0.0.1:18083/snapshot";
    Annotated<std::uint32_t, "sample_rate", Doc<"Audio sample rate in Hz">, Visible> sample_rate = 48000U;
    Annotated<gr::Size_t, "channels", Doc<"Interleaved audio channel count">, Visible> channels = 1UZ;
    Annotated<std::uint32_t, "poll_ms", Doc<"Suggested poll interval in milliseconds for poll transports">, Visible> poll_ms = 100U;
    Annotated<gr::Size_t, "window_size", Doc<"Samples per channel kept in memory">, Visible> window_size = 2048UZ;
    Annotated<bool, "autoscale", Doc<"Enable automatic axis scaling in Studio Application">, Visible> autoscale = true;
    Annotated<float, "x_min", Doc<"Optional x-axis minimum when autoscale is disabled">, Visible> x_min = 0.0F;
    Annotated<float, "x_max", Doc<"Optional x-axis maximum when autoscale is disabled">, Visible> x_max = 0.0F;
    Annotated<float, "y_min", Doc<"Optional y-axis minimum when autoscale is disabled">, Visible> y_min = 0.0F;
    Annotated<float, "y_max", Doc<"Optional y-axis maximum when autoscale is disabled">, Visible> y_max = 0.0F;
    Annotated<std::string, "topic", Doc<"Optional stream topic for pub/sub transports">, Visible> topic = "";

    GR_MAKE_REFLECTABLE(StudioAudioMonitor, in, transport, endpoint, sample_rate, channels, poll_ms, window_size, autoscale, x_min, x_max, y_min, y_max, topic);

    using Block<StudioAudioMonitor<T>>::Block;

    void start() {
        _window.configure(static_cast<std::size_t>(channels), static_cast<std::size_t>(window_size));
        startTransport();
    }

    void stop() { _http.stop(); }

    void settingsChanged(const property_map&, const property_map& new_settings) {
        if (new_settings.contains("channels") || new_settings.contains("window_size")) {
            _window.configure(static_cast<std::size_t>(channels), static_cast<std::size_t>(window_size));
        }

        if (new_settings.contains("transport") || new_settings.contains("endpoint")) {
            startTransport();
        }
    }

    [[nodiscard]] work::Status processBulk(InputSpanLike auto& input) noexcept {
        if (!input.empty()) {
            _window.pushInterleaved(std::span<const T>(input.data(), input.size()));
            std::ignore = input.consume(input.size());
        }
        return work::Status::OK;
    }

private:
    void startTransport() {
        if (!detail::isHttpTransport(transport.value)) {
            throw gr::exception("StudioAudioMonitor currently supports only http_snapshot and http_poll transports.");
        }

        const auto parsed = detail::parseHttpEndpoint(endpoint.value);
        if (!_http.start(parsed, [this]() { return _window.snapshotJson(sample_rate); })) {
            throw gr::exception("StudioAudioMonitor failed to start HTTP transport endpoint.");
        }
    }

    detail::AudioWindow<T> _window{};
    detail::SnapshotHttpService _http{};
};

} // namespace gr::studio
