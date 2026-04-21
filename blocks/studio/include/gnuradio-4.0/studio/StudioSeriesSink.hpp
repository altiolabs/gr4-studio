#pragma once

#include <gnuradio-4.0/Block.hpp>
#include <gnuradio-4.0/BlockRegistry.hpp>

#include <chrono>
#include <httplib.h>

#include <algorithm>
#include <complex>
#include <concepts>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <limits>
#include <span>
#include <sstream>
#include <string>
#include <string_view>
#include <thread>
#include <utility>
#include <vector>

#include <gnuradio-4.0/studio/StudioWebSocketTransport.hpp>

namespace gr::studio {

namespace detail {

enum class SeriesTransport {
    http_snapshot,
    http_poll,
    websocket,
};

template<typename T>
concept SupportedSample = std::same_as<T, float> || std::same_as<T, std::complex<float>>;

template<SupportedSample T>
class SeriesWindow {
public:
    explicit SeriesWindow(std::size_t channel_count = 1UZ, std::size_t window_size = 1024UZ) {
        configure(channel_count, window_size);
    }

    void configure(std::size_t channel_count, std::size_t window_size) {
        std::lock_guard lock(_mutex);
        _channels   = std::max<std::size_t>(1UZ, channel_count);
        _windowSize = std::max<std::size_t>(1UZ, window_size);
        _ring.assign(_channels * _windowSize, T{});
        _pending.clear();
        _writeIndex = 0UZ;
        _filled     = 0UZ;
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

    [[nodiscard]] std::string snapshotJson() const {
        std::vector<std::vector<T>> perChannel;
        std::size_t                 channelCount = 0UZ;
        std::size_t                 samplesPerChannel = 0UZ;

        {
            std::lock_guard lock(_mutex);
            channelCount       = _channels;
            samplesPerChannel  = _filled;
            perChannel.assign(channelCount, std::vector<T>(samplesPerChannel));

            const std::size_t oldest = (_filled == _windowSize) ? _writeIndex : 0UZ;
            for (std::size_t channel = 0UZ; channel < channelCount; ++channel) {
                for (std::size_t index = 0UZ; index < samplesPerChannel; ++index) {
                    const std::size_t ringIndex = (oldest + index) % _windowSize;
                    perChannel[channel][index]  = _ring[channel * _windowSize + ringIndex];
                }
            }
        }

        std::ostringstream os;
        os.precision(9);
        if constexpr (std::same_as<T, float>) {
            os << "{\"sample_type\":\"float32\",";
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
        } else {
            os << "{\"sample_type\":\"complex64\",";
            os << "\"channels\":" << channelCount << ",";
            os << "\"samples_per_channel\":" << samplesPerChannel << ",";
            os << "\"layout\":\"channels_first_interleaved_complex\",";
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
                    os << perChannel[channel][index].real() << ',' << perChannel[channel][index].imag();
                }
                os << ']';
            }
            os << "]}";
        }

        return os.str();
    }

private:
    mutable std::mutex _mutex;
    std::size_t        _channels   = 1UZ;
    std::size_t        _windowSize = 1024UZ;
    std::vector<T>     _ring;
    std::vector<T>     _pending;
    std::size_t        _writeIndex = 0UZ;
    std::size_t        _filled     = 0UZ;
};

struct ParsedHttpEndpoint {
    std::string   host;
    std::uint16_t port;
    std::string   path;
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

        _host      = endpoint.host;
        _port      = endpoint.port;
        _path      = endpoint.path;
        _provider  = std::move(provider);
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
    std::string                     _host{"127.0.0.1"};
    std::uint16_t                   _port{8080U};
    std::uint16_t                   _boundPort{0U};
    std::string                     _path{"/snapshot"};
    JsonProvider                    _provider;
    std::unique_ptr<httplib::Server> _server;
    std::thread                     _serverThread;
};

inline bool isHttpTransport(const SeriesTransport transport) {
    return transport == SeriesTransport::http_snapshot || transport == SeriesTransport::http_poll;
}

inline bool isWebSocketTransport(const SeriesTransport transport) {
    return transport == SeriesTransport::websocket;
}

} // namespace detail

GR_REGISTER_BLOCK("gr::studio::StudioSeriesSink", gr::studio::StudioSeriesSink, ([T]), [ float, std::complex<float> ])

template<detail::SupportedSample T>
struct StudioSeriesSink : Block<StudioSeriesSink<T>> {
    using Description = Doc<"@brief Studio 1D series sink with explicit transport configuration.">;

    PortIn<T> in;

    Annotated<detail::SeriesTransport, "transport", Doc<"Data-plane transport mode">, Visible> transport = detail::SeriesTransport::http_poll;
    Annotated<std::string, "endpoint", Doc<"Transport endpoint URL/path">, Visible> endpoint = "http://127.0.0.1:18080/snapshot";
    Annotated<std::uint32_t, "update_ms", Doc<"Suggested update interval in milliseconds for http_poll and websocket transports">, Visible> update_ms = 250U;
    Annotated<gr::Size_t, "window_size", Doc<"Samples per channel kept in memory">, Visible> window_size = 1024UZ;
    Annotated<gr::Size_t, "channels", Doc<"Interleaved input channel count">, Visible> channels = 1UZ;
    Annotated<std::string, "plot_title", Doc<"Optional semantic plot title for Studio Application">, Visible> plot_title = "";
    Annotated<std::string, "x_label", Doc<"Optional semantic x-axis label for Studio Application">, Visible> x_label = "";
    Annotated<std::string, "y_label", Doc<"Optional semantic y-axis label for Studio Application">, Visible> y_label = "";
    Annotated<std::string, "series_labels", Doc<"Optional comma-separated series labels for Studio Application">, Visible> series_labels = "";
    Annotated<bool, "autoscale", Doc<"Enable automatic axis scaling in Studio Application">, Visible> autoscale = true;
    Annotated<float, "x_min", Doc<"Optional x-axis minimum when autoscale is disabled">, Visible> x_min = 0.0F;
    Annotated<float, "x_max", Doc<"Optional x-axis maximum when autoscale is disabled">, Visible> x_max = 0.0F;
    Annotated<float, "y_min", Doc<"Optional y-axis minimum when autoscale is disabled">, Visible> y_min = 0.0F;
    Annotated<float, "y_max", Doc<"Optional y-axis maximum when autoscale is disabled">, Visible> y_max = 0.0F;
    Annotated<std::string, "topic", Doc<"Optional stream topic for pub/sub transports">, Visible> topic = "";

    GR_MAKE_REFLECTABLE(
        StudioSeriesSink,
        in,
        transport,
        endpoint,
        update_ms,
        window_size,
        channels,
        plot_title,
        x_label,
        y_label,
        series_labels,
        autoscale,
        x_min,
        x_max,
        y_min,
        y_max,
        topic);

    using Block<StudioSeriesSink<T>>::Block;

    void start() {
        _window.configure(static_cast<std::size_t>(channels), static_cast<std::size_t>(window_size));
        startTransport();
    }

    void stop() {
        _http.stop();
        _websocket.stop();
    }

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
            publishWebSocketFrame();
            std::ignore = input.consume(input.size());
        }
        return work::Status::OK;
    }

private:
    void startTransport() {
        _http.stop();
        _websocket.stop();
        _lastWebSocketPublishAt = {};

        if (detail::isWebSocketTransport(transport.value)) {
            const auto parsed = detail::parseHttpEndpoint(endpoint.value);
            if (!_websocket.start(parsed.host, parsed.port, parsed.path)) {
                std::ostringstream message;
                message << "StudioSeriesSink failed to start websocket transport endpoint at ";
                message << endpoint.value << " (parsed host=" << parsed.host << ", port=" << parsed.port << ", path=" << parsed.path << ")";
                const auto reason = _websocket.lastErrorMessage();
                if (!reason.empty()) {
                    message << ": " << reason;
                }
                throw gr::exception(message.str());
            }
            return;
        }

        if (!detail::isHttpTransport(transport.value)) {
            throw gr::exception("StudioSeriesSink currently supports only http_snapshot, http_poll, and websocket transports.");
        }

        const auto parsed = detail::parseHttpEndpoint(endpoint.value);
        if (!_http.start(parsed, [this]() { return _window.snapshotJson(); })) {
            throw gr::exception("StudioSeriesSink failed to start HTTP transport endpoint.");
        }
    }

    detail::SeriesWindow<T>     _window{};
    detail::SnapshotHttpService _http{};
    websocket_transport::SnapshotWebSocketService _websocket{};
    std::chrono::steady_clock::time_point _lastWebSocketPublishAt{};

    void publishWebSocketFrame() {
        if (!_websocket.isRunning()) {
            return;
        }

        const auto now = std::chrono::steady_clock::now();
        const auto interval = std::chrono::milliseconds(std::max<std::uint32_t>(1U, update_ms));
        if (_lastWebSocketPublishAt != std::chrono::steady_clock::time_point{} &&
            now - _lastWebSocketPublishAt < interval) {
            return;
        }

        _lastWebSocketPublishAt = now;
        _websocket.publishText(_window.snapshotJson());
    }
};

} // namespace gr::studio
