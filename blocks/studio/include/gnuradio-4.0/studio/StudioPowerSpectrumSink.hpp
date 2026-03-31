#pragma once

#include <gnuradio-4.0/Block.hpp>
#include <gnuradio-4.0/BlockRegistry.hpp>

#include <httplib.h>

#include <algorithm>
#include <cmath>
#include <complex>
#include <concepts>
#include <cstddef>
#include <cstdint>
#include <deque>
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

#include <gnuradio-4.0/algorithm/fourier/fft.hpp>
#include <gnuradio-4.0/algorithm/fourier/fft_common.hpp>
#include <gnuradio-4.0/algorithm/fourier/window.hpp>

namespace gr::studio {

namespace detail {

template<typename T>
concept SupportedPowerSpectrumSample = std::same_as<T, float> || std::same_as<T, std::complex<float>>;

inline std::string escapeJson(std::string_view text) {
    std::string out;
    out.reserve(text.size() + 8U);
    for (const char c : text) {
        switch (c) {
        case '\"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\b': out += "\\b"; break;
        case '\f': out += "\\f"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default: out += c; break;
        }
    }
    return out;
}

template<SupportedPowerSpectrumSample T>
class PowerSpectrumWindow {
public:
    using value_type = float;
    using complex_type = std::complex<value_type>;
    using fft_type = gr::algorithm::FFT<T, complex_type>;

    void configure(std::size_t fft_size, std::size_t num_averages, float sample_rate, std::string window, bool output_in_db) {
        std::lock_guard lock(_mutex);
        _fftSize = std::max<std::size_t>(1UZ, fft_size);
        _numAverages = std::max<std::size_t>(1UZ, num_averages);
        _sampleRate = sample_rate > 0.0F ? sample_rate : 1.0F;
        _windowName = std::move(window);
        _outputInDb = output_in_db;

        const auto parsedWindow = magic_enum::enum_cast<gr::algorithm::window::Type>(_windowName, magic_enum::case_insensitive)
                                      .value_or(gr::algorithm::window::Type::BlackmanHarris);
        _windowType = parsedWindow;
        _window.assign(_fftSize, value_type{});
        gr::algorithm::window::create(_window, _windowType);

        _fftInput.assign(_fftSize, T{});
        _fftOutput.assign(_fftSize, complex_type{});
        _currentSpectrum.assign(_spectrumSize(), value_type{});
        _spectrumSum.assign(_spectrumSize(), value_type{});
        _averagedSpectrum.assign(_spectrumSize(), value_type{});
        _frequencies.assign(_spectrumSize(), value_type{});
        rebuildFrequencyAxisLocked();
        _history.clear();
    }

    void processFrame(std::span<const T> input) {
        if (input.size() != _fftSize) {
            return;
        }

        std::lock_guard lock(_mutex);
        if (_fftInput.size() != _fftSize) {
            _fftInput.assign(_fftSize, T{});
        }
        if (_window.size() != _fftSize) {
            _window.assign(_fftSize, value_type{});
            gr::algorithm::window::create(_window, _windowType);
        }

        std::copy_n(input.begin(), static_cast<std::ptrdiff_t>(_fftSize), _fftInput.begin());
        for (std::size_t index = 0UZ; index < _fftSize; ++index) {
            if constexpr (gr::meta::complex_like<T>) {
                _fftInput[index].real(_fftInput[index].real() * _window[index]);
                _fftInput[index].imag(_fftInput[index].imag() * _window[index]);
            } else {
                _fftInput[index] *= _window[index];
            }
        }

        _fftOutput = _fftImpl.compute(_fftInput);

        const bool computeFullSpectrum = gr::meta::complex_like<T>;
        _currentSpectrum = gr::algorithm::fft::computeMagnitudeSpectrum(
            _fftOutput,
            {},
            gr::algorithm::fft::ConfigMagnitude{
                .computeHalfSpectrum = !computeFullSpectrum,
                .outputInDb = false,
                .shiftSpectrum = computeFullSpectrum,
            });

        const value_type normalization = static_cast<value_type>(1.0F);
        std::ranges::transform(_currentSpectrum, _currentSpectrum.begin(), [normalization](const value_type magnitude) {
            return (magnitude * magnitude) * normalization;
        });

        if (_history.size() == _numAverages) {
            const auto& oldest = _history.front();
            for (std::size_t index = 0UZ; index < _spectrumSum.size(); ++index) {
                _spectrumSum[index] -= oldest[index];
            }
            _history.pop_front();
        }

        if (_spectrumSum.size() != _currentSpectrum.size()) {
            _spectrumSum.assign(_currentSpectrum.size(), value_type{});
        }

        for (std::size_t index = 0UZ; index < _currentSpectrum.size(); ++index) {
            _spectrumSum[index] += _currentSpectrum[index];
        }

        _history.push_back(_currentSpectrum);
        const value_type denominator = static_cast<value_type>(_history.size());
        _averagedSpectrum.resize(_currentSpectrum.size());
        for (std::size_t index = 0UZ; index < _currentSpectrum.size(); ++index) {
            _averagedSpectrum[index] = _spectrumSum[index] / denominator;
        }
    }

    [[nodiscard]] std::vector<value_type> frequencyAxis() const {
        std::lock_guard lock(_mutex);
        return _frequencies;
    }

    [[nodiscard]] std::vector<value_type> powerSpectrum() const {
        std::lock_guard lock(_mutex);
        return _displaySpectrumLocked();
    }

    [[nodiscard]] std::string snapshotJson() const {
        std::vector<value_type> frequencies;
        std::vector<value_type> spectrum;
        std::size_t fftSize = 0UZ;
        std::size_t numAverages = 0UZ;
        std::string window;
        bool outputInDb = false;

        {
            std::lock_guard lock(_mutex);
            frequencies = _frequencies;
            spectrum = _displaySpectrumLocked();
            fftSize = _fftSize;
            numAverages = _numAverages;
            window = _windowName;
            outputInDb = _outputInDb;
        }

        if (frequencies.empty() || spectrum.empty()) {
            return R"({"payload_format":"dataset-xy-json-v1","layout":"pairs_xy","points":0,"data":[]})";
        }

        const std::size_t points = std::min(frequencies.size(), spectrum.size());
        std::ostringstream os;
        os.precision(9);
        os << "{\"payload_format\":\"dataset-xy-json-v1\",";
        os << "\"layout\":\"pairs_xy\",";
        os << "\"points\":" << points << ",";
        os << "\"sample_type\":\"float32\",";
        os << "\"axis_name\":\"Frequency\",";
        os << "\"axis_unit\":\"Hz\",";
        os << "\"signal_name\":\"Power Spectrum\",";
        os << "\"signal_unit\":\"" << (outputInDb ? "dB" : "power") << "\",";
        os << "\"fft_size\":" << fftSize << ",";
        os << "\"num_averages\":" << numAverages << ",";
        os << "\"window\":\"" << escapeJson(window) << "\",";
        os << "\"output_in_db\":" << (outputInDb ? "true" : "false") << ",";
        os << "\"data\":[";
        for (std::size_t index = 0UZ; index < points; ++index) {
            if (index > 0UZ) {
                os << ',';
            }
            os << '[' << frequencies[index] << ',' << spectrum[index] << ']';
        }
        os << "]}";
        return os.str();
    }

private:
    [[nodiscard]] std::size_t _spectrumSize() const noexcept {
        return gr::meta::complex_like<T> ? _fftSize : (_fftSize / 2UZ);
    }

    void rebuildFrequencyAxisLocked() {
        const std::size_t bins = _spectrumSize();
        _frequencies.assign(bins, value_type{});
        const value_type freqWidth = _sampleRate / static_cast<value_type>(_fftSize);

        if constexpr (gr::meta::complex_like<T>) {
            const value_type freqOffset = static_cast<value_type>(bins / 2UZ) * freqWidth;
            for (std::size_t index = 0UZ; index < bins; ++index) {
                _frequencies[index] = static_cast<value_type>(index) * freqWidth - freqOffset;
            }
        } else {
            for (std::size_t index = 0UZ; index < bins; ++index) {
                _frequencies[index] = static_cast<value_type>(index) * freqWidth;
            }
        }
    }

    [[nodiscard]] std::vector<value_type> _displaySpectrumLocked() const {
        if (_averagedSpectrum.empty()) {
            return {};
        }

        if (! _outputInDb) {
            return _averagedSpectrum;
        }

        std::vector<value_type> display = _averagedSpectrum;
        constexpr value_type minimumPower = static_cast<value_type>(1.0e-16F);
        for (auto& value : display) {
            const value_type clamped = std::max(value, minimumPower);
            value = static_cast<value_type>(10.0F) * std::log10(clamped);
        }
        return display;
    }

    mutable std::mutex _mutex;
    std::size_t _fftSize = 1024UZ;
    std::size_t _numAverages = 8UZ;
    float _sampleRate = 1.0F;
    std::string _windowName = std::string(magic_enum::enum_name(gr::algorithm::window::Type::BlackmanHarris));
    bool _outputInDb = true;
    gr::algorithm::window::Type _windowType = gr::algorithm::window::Type::BlackmanHarris;
    fft_type _fftImpl{};
    std::vector<value_type> _window{};
    std::vector<T> _fftInput{};
    std::vector<complex_type> _fftOutput{};
    std::vector<value_type> _currentSpectrum{};
    std::vector<value_type> _spectrumSum{};
    std::vector<value_type> _averagedSpectrum{};
    std::vector<value_type> _frequencies{};
    std::deque<std::vector<value_type>> _history{};
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

GR_REGISTER_BLOCK("gr::studio::StudioPowerSpectrumSink", gr::studio::StudioPowerSpectrumSink, ([T]), [ float, std::complex<float> ])

template<detail::SupportedPowerSpectrumSample T>
struct StudioPowerSpectrumSink : Block<StudioPowerSpectrumSink<T>> {
    using Description = Doc<"@brief Studio power spectrum sink with FFT windowing and averaged spectra.">;

    PortIn<T> in;

    Annotated<std::string, "transport", Doc<"Data-plane transport mode">, Visible> transport = "http_poll";
    Annotated<std::string, "endpoint", Doc<"Transport endpoint URL/path">, Visible> endpoint = "http://127.0.0.1:18085/snapshot";
    Annotated<std::uint32_t, "poll_ms", Doc<"Suggested poll interval in milliseconds for poll transports">, Visible> poll_ms = 250U;
    Annotated<gr::Size_t, "fft_size", Doc<"FFT size used for each spectrum frame">, Visible> fft_size = 1024UZ;
    Annotated<gr::Size_t, "num_averages", Doc<"Number of FFT frames averaged into the displayed spectrum">, Visible> num_averages = 8UZ;
    Annotated<std::string, "window", Doc<gr::algorithm::window::TypeNames>, Visible> window = std::string(magic_enum::enum_name(gr::algorithm::window::Type::BlackmanHarris));
    Annotated<float, "sample_rate", Doc<"Input sample rate in Hz">, Visible> sample_rate = 1.0F;
    Annotated<bool, "output_in_db", Doc<"Render the averaged power spectrum in dB">, Visible> output_in_db = true;
    Annotated<std::string, "plot_title", Doc<"Optional semantic plot title for Studio Application">, Visible> plot_title = "Power Spectrum";
    Annotated<std::string, "x_label", Doc<"Optional semantic x-axis label for Studio Application">, Visible> x_label = "Frequency";
    Annotated<std::string, "y_label", Doc<"Optional semantic y-axis label for Studio Application">, Visible> y_label = "Power";
    Annotated<std::string, "series_labels", Doc<"Optional comma-separated series labels for Studio Application">, Visible> series_labels = "Power";
    Annotated<bool, "autoscale", Doc<"Enable automatic axis scaling in Studio Application">, Visible> autoscale = true;
    Annotated<float, "x_min", Doc<"Optional x-axis minimum when autoscale is disabled">, Visible> x_min = 0.0F;
    Annotated<float, "x_max", Doc<"Optional x-axis maximum when autoscale is disabled">, Visible> x_max = 0.0F;
    Annotated<float, "y_min", Doc<"Optional y-axis minimum when autoscale is disabled">, Visible> y_min = 0.0F;
    Annotated<float, "y_max", Doc<"Optional y-axis maximum when autoscale is disabled">, Visible> y_max = 0.0F;
    Annotated<std::string, "topic", Doc<"Optional stream topic for pub/sub transports">, Visible> topic = "";

    GR_MAKE_REFLECTABLE(
        StudioPowerSpectrumSink,
        in,
        transport,
        endpoint,
        poll_ms,
        fft_size,
        num_averages,
        window,
        sample_rate,
        output_in_db,
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

    using Block<StudioPowerSpectrumSink<T>>::Block;

    void start() {
        _window.configure(static_cast<std::size_t>(fft_size), static_cast<std::size_t>(num_averages), sample_rate, window.value, output_in_db);
        syncInputPortConstraints();
        startTransport();
    }

    void stop() { _http.stop(); }

    void settingsChanged(const property_map&, const property_map& new_settings) {
        if (new_settings.contains("fft_size") || new_settings.contains("num_averages") || new_settings.contains("window") || new_settings.contains("sample_rate")) {
            _window.configure(static_cast<std::size_t>(fft_size), static_cast<std::size_t>(num_averages), sample_rate, window.value, output_in_db);
            syncInputPortConstraints();
        }

        if (new_settings.contains("transport") || new_settings.contains("endpoint")) {
            startTransport();
        }
    }

    void processSamples(std::span<const T> input) {
        if (input.size() < static_cast<std::size_t>(fft_size)) {
            return;
        }

        _window.processFrame(input.first(static_cast<std::size_t>(fft_size)));
    }

    [[nodiscard]] work::Status processBulk(InputSpanLike auto& input) noexcept {
        if (!input.empty()) {
            const std::size_t available = input.size();
            const std::size_t frameSize  = static_cast<std::size_t>(fft_size);
            const std::size_t frames     = available / frameSize;

            for (std::size_t frame = 0UZ; frame < frames; ++frame) {
                const std::size_t offset = frame * frameSize;
                _window.processFrame(std::span<const T>(input.data() + offset, frameSize));
            }

            std::ignore = input.consume(available);
        }

        return work::Status::OK;
    }

    [[nodiscard]] std::string snapshotJson() const { return _window.snapshotJson(); }

private:
    void startTransport() {
        if (!detail::isHttpTransport(transport.value)) {
            throw gr::exception("StudioPowerSpectrumSink currently supports only http_snapshot and http_poll transports.");
        }

        const auto parsed = detail::parseHttpEndpoint(endpoint.value);
        if (!_http.start(parsed, [this]() { return _window.snapshotJson(); })) {
            throw gr::exception("StudioPowerSpectrumSink failed to start HTTP transport endpoint.");
        }
    }

    detail::PowerSpectrumWindow<T> _window{};
    detail::SnapshotHttpService _http{};

    void syncInputPortConstraints() {
        const auto chunkSize = static_cast<std::size_t>(fft_size);
        in.min_samples = chunkSize;
        in.max_samples = chunkSize;
    }
};

} // namespace gr::studio
