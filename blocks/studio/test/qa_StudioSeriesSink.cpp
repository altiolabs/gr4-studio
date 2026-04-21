#include <algorithm>
#include <atomic>
#include <cassert>
#include <chrono>
#include <string>
#include <thread>

#include <gnuradio-4.0/BlockRegistry.hpp>
#include <gnuradio-4.0/studio/StudioSeriesSink.hpp>

#if !defined(_WIN32)
#include <arpa/inet.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

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
    assert(block.transport.value == gr::studio::detail::SeriesTransport::http_poll);
    assert(block.update_ms == 250U);
}

void testWebSocketTransportLifecycle() {
    gr::studio::StudioSeriesSink<float> block{};
    block.transport = gr::studio::detail::SeriesTransport::websocket;
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

    const auto parsedWebSocket = gr::studio::detail::parseHttpEndpoint("ws://127.0.0.1:48055/stream");
    assert(parsedWebSocket.host == "127.0.0.1");
    assert(parsedWebSocket.port == 48055U);
    assert(parsedWebSocket.path == "/stream");

    assert(gr::studio::detail::isHttpTransport(gr::studio::detail::SeriesTransport::http_poll));
    assert(gr::studio::detail::isHttpTransport(gr::studio::detail::SeriesTransport::http_snapshot));
    assert(gr::studio::detail::isWebSocketTransport(gr::studio::detail::SeriesTransport::websocket));
    assert(!gr::studio::detail::isWebSocketTransport(gr::studio::detail::SeriesTransport::http_poll));
}

#if !defined(_WIN32)
void testWebSocketStopUnblocksIncompleteHandshake() {
    gr::studio::websocket_transport::SnapshotWebSocketService service{};
    assert(service.start("127.0.0.1", 0U, "/stream"));
    const auto port = service.boundPort();
    assert(port != 0U);

    const int clientFd = ::socket(AF_INET, SOCK_STREAM, 0);
    assert(clientFd >= 0);

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    const int inetResult = ::inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);
    assert(inetResult == 1);
    const int connectResult = ::connect(clientFd, reinterpret_cast<const sockaddr*>(&addr), sizeof(addr));
    assert(connectResult == 0);

    std::atomic_bool stopReturned = false;
    std::thread stopper([&]() {
        service.stop();
        stopReturned.store(true);
    });

    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    assert(stopReturned.load());

    stopper.join();
    ::close(clientFd);
}
#endif

} // namespace

int main() {
    testSeriesRegistered();
    testDefaultTransportAndCadence();
    testWebSocketTransportLifecycle();
    testHttpTransportHelpers();
#if !defined(_WIN32)
    testWebSocketStopUnblocksIncompleteHandshake();
#endif
    return 0;
}
