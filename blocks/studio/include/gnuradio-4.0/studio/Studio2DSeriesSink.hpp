#pragma once

#include <gnuradio-4.0/Block.hpp>
#include <gnuradio-4.0/BlockRegistry.hpp>

#include <httplib.h>

#include <algorithm>
#include <complex>
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
concept Supported2DSample = std::same_as<T, float> || std::same_as<T, std::complex<float>>;

struct XYPoint {
    float x = 0.0F;
    float y = 0.0F;
};

class XYPointWindow {
public:
    explicit XYPointWindow(std::size_t window_size = 1024UZ) { configure(window_size); }

    void configure(std::size_t window_size) {
        std::lock_guard lock(_mutex);
        _windowSize = std::max<std::size_t>(1UZ, window_size);
        _ring.assign(_windowSize, XYPoint{});
        _pendingFloat.clear();
        _writeIndex = 0UZ;
        _filled     = 0UZ;
    }

    void pushFloatSamples(std::span<const float> input) {
        if (input.empty()) {
            return;
        }

        std::lock_guard lock(_mutex);
        _pendingFloat.insert(_pendingFloat.end(), input.begin(), input.end());

        const std::size_t pairs = _pendingFloat.size() / 2UZ;
        for (std::size_t index = 0UZ; index < pairs; ++index) {
            const float x = _pendingFloat[index * 2UZ];
            const float y = _pendingFloat[index * 2UZ + 1UZ];
            _ring[_writeIndex] = XYPoint{x, y};
            _writeIndex = (_writeIndex + 1UZ) % _windowSize;
            if (_filled < _windowSize) {
                ++_filled;
            }
        }

        const std::size_t consumed = pairs * 2UZ;
        if (consumed > 0UZ) {
            _pendingFloat.erase(_pendingFloat.begin(), _pendingFloat.begin() + static_cast<std::ptrdiff_t>(consumed));
        }
    }

    void pushComplexSamples(std::span<const std::complex<float>> input) {
        if (input.empty()) {
            return;
        }

        std::lock_guard lock(_mutex);
        for (const auto& value : input) {
            _ring[_writeIndex] = XYPoint{value.real(), value.imag()};
            _writeIndex = (_writeIndex + 1UZ) % _windowSize;
            if (_filled < _windowSize) {
                ++_filled;
            }
        }
    }

    [[nodiscard]] std::string snapshotJson(const char* sample_type, std::string_view render_mode) const {
        std::vector<XYPoint> points;
        points.reserve(_filled);
        {
            std::lock_guard lock(_mutex);
            const std::size_t oldest = (_filled == _windowSize) ? _writeIndex : 0UZ;
            for (std::size_t index = 0UZ; index < _filled; ++index) {
                const std::size_t ringIndex = (oldest + index) % _windowSize;
                points.push_back(_ring[ringIndex]);
            }
        }

        std::ostringstream os;
        os.precision(9);
        os << "{\"sample_type\":\"" << sample_type << "\",";
        os << "\"points\":" << points.size() << ",";
        os << "\"layout\":\"pairs_xy\",";
        os << "\"render_mode\":\"" << render_mode << "\",";
        os << "\"data\":[";
        for (std::size_t index = 0UZ; index < points.size(); ++index) {
            if (index > 0UZ) {
                os << ',';
            }
            os << '[' << points[index].x << ',' << points[index].y << ']';
        }
        os << "]}";
        return os.str();
    }

private:
    mutable std::mutex _mutex;
    std::size_t        _windowSize = 1024UZ;
    std::vector<XYPoint> _ring;
    std::vector<float> _pendingFloat;
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
    constexpr std::string_view prefix = "http://";
    if (remaining.starts_with(prefix)) {
        remaining.erase(0UZ, prefix.size());
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
    std::string                      _host{"127.0.0.1"};
    std::uint16_t                    _port{8080U};
    std::uint16_t                    _boundPort{0U};
    std::string                      _path{"/snapshot"};
    JsonProvider                     _provider;
    std::unique_ptr<httplib::Server> _server;
    std::thread                      _serverThread;
};

inline bool isHttpTransport(const std::string& transport) {
    return transport == "http_snapshot" || transport == "http_poll";
}

inline std::string_view normalizeRenderMode(std::string_view render_mode) {
    return render_mode == "scatter" ? "scatter" : "line";
}

} // namespace detail

GR_REGISTER_BLOCK("gr::studio::Studio2DSeriesSink", gr::studio::Studio2DSeriesSink, ([T]), [ float, std::complex<float> ])

template<detail::Supported2DSample T>
struct Studio2DSeriesSink : Block<Studio2DSeriesSink<T>> {
    using Description = Doc<"@brief Studio 2D series sink with explicit transport configuration.">;

    PortIn<T> in;

    Annotated<std::string, "transport", Doc<"Data-plane transport mode">, Visible> transport = "http_poll";
    Annotated<std::string, "endpoint", Doc<"Transport endpoint URL/path">, Visible> endpoint = "http://127.0.0.1:18081/snapshot";
    Annotated<std::uint32_t, "poll_ms", Doc<"Suggested poll interval in milliseconds for poll transports">, Visible> poll_ms = 250U;
    Annotated<gr::Size_t, "window_size", Doc<"2D points kept in memory">, Visible> window_size = 1024UZ;
    Annotated<std::string, "render_mode", Doc<"XY render hint: line or scatter">, Visible> render_mode = "line";
    Annotated<bool, "autoscale", Doc<"Enable automatic axis scaling in Studio Application">, Visible> autoscale = true;
    Annotated<float, "x_min", Doc<"Optional x-axis minimum when autoscale is disabled">, Visible> x_min = 0.0F;
    Annotated<float, "x_max", Doc<"Optional x-axis maximum when autoscale is disabled">, Visible> x_max = 0.0F;
    Annotated<float, "y_min", Doc<"Optional y-axis minimum when autoscale is disabled">, Visible> y_min = 0.0F;
    Annotated<float, "y_max", Doc<"Optional y-axis maximum when autoscale is disabled">, Visible> y_max = 0.0F;
    Annotated<std::string, "topic", Doc<"Optional stream topic for pub/sub transports">, Visible> topic = "";

    GR_MAKE_REFLECTABLE(Studio2DSeriesSink, in, transport, endpoint, poll_ms, window_size, render_mode, autoscale, x_min, x_max, y_min, y_max, topic);

    using Block<Studio2DSeriesSink<T>>::Block;

    void start() {
        _window.configure(static_cast<std::size_t>(window_size));
        startTransport();
    }

    void stop() { _http.stop(); }

    void settingsChanged(const property_map&, const property_map& new_settings) {
        if (new_settings.contains("window_size")) {
            _window.configure(static_cast<std::size_t>(window_size));
        }

        if (new_settings.contains("transport") || new_settings.contains("endpoint")) {
            startTransport();
        }
    }

    [[nodiscard]] work::Status processBulk(InputSpanLike auto& input) noexcept {
        if (input.empty()) {
            return work::Status::OK;
        }

        if constexpr (std::same_as<T, float>) {
            _window.pushFloatSamples(std::span<const float>(input.data(), input.size()));
        } else {
            _window.pushComplexSamples(std::span<const std::complex<float>>(input.data(), input.size()));
        }
        std::ignore = input.consume(input.size());
        return work::Status::OK;
    }

private:
    void startTransport() {
        if (!detail::isHttpTransport(transport.value)) {
            throw gr::exception("Studio2DSeriesSink currently supports only http_snapshot and http_poll transports.");
        }

        const auto parsed = detail::parseHttpEndpoint(endpoint.value);
        const char* sampleType = std::same_as<T, float> ? "xy_float32" : "xy_complex64";
        if (!_http.start(parsed,
                         [this, sampleType]() {
                             return _window.snapshotJson(sampleType, detail::normalizeRenderMode(render_mode.value));
                         })) {
            throw gr::exception("Studio2DSeriesSink failed to start HTTP transport endpoint.");
        }
    }

    detail::XYPointWindow      _window{};
    detail::SnapshotHttpService _http{};
};

} // namespace gr::studio
