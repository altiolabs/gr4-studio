#include <algorithm>
#include <cassert>
#include <string>

#include <gnuradio-4.0/BlockRegistry.hpp>
#include <gnuradio-4.0/studio/StudioSeriesSink.hpp>

namespace {

void testSeriesRegistered() {
    const auto keys = gr::globalBlockRegistry().keys();
    const bool foundSeries = std::ranges::any_of(keys, [](const std::string& key) {
        return key.find("StudioSeriesSink") != std::string::npos;
    });
    assert(foundSeries);
}

void testDefaultTransportAndCadence() {
    gr::studio::StudioSeriesSink<float> block{};
    assert(block.transport.value == "http_poll");
    assert(block.update_ms == 250U);
}

void testWebSocketTransportLifecycle() {
    gr::studio::StudioSeriesSink<float> block{};
    block.transport = "websocket";
    block.endpoint = "http://127.0.0.1:0/snapshot";
    block.update_ms = 10U;

    block.start();
    const std::string json = block.snapshotJson();
    assert(json.find("\"payload_format\":\"series-window-json-v1\"") != std::string::npos);
    assert(json.find("\"sample_type\":\"float32\"") != std::string::npos);
    block.stop();
}

void testHttpTransportHelpers() {
    const auto parsed = gr::studio::detail::parseHttpEndpoint("http://127.0.0.1:18080/custom/snapshot");
    assert(parsed.host == "127.0.0.1");
    assert(parsed.port == 18080U);
    assert(parsed.path == "/custom/snapshot");
    assert(gr::studio::detail::isHttpTransport("http_poll"));
    assert(gr::studio::detail::isHttpTransport("http_snapshot"));
    assert(gr::studio::detail::isWebSocketTransport("websocket"));
    assert(!gr::studio::detail::isWebSocketTransport("sse"));
}

} // namespace

int main() {
    testSeriesRegistered();
    testDefaultTransportAndCadence();
    testWebSocketTransportLifecycle();
    testHttpTransportHelpers();
    return 0;
}
