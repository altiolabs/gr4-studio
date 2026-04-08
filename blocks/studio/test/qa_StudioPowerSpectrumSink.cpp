#include <cassert>
#include <array>
#include <algorithm>
#include <complex>
#include <cstddef>
#include <span>
#include <string>

#include <gnuradio-4.0/BlockRegistry.hpp>
#include <gnuradio-4.0/Tag.hpp>
#include <gnuradio-4.0/studio/StudioPowerSpectrumSink.hpp>

namespace {

template<typename TBlock>
void configureBlock(TBlock& block) {
    block.fft_size = 4UZ;
    block.num_averages = 2UZ;
    block.window = std::string("Rectangular");
    block.sample_rate = 8.0F;
    block.update_ms = 125U;
    block.output_in_db = false;
    block.persistence = true;
    block.phosphor_intensity = 1.25F;
    block.phosphor_decay_ms = 750.0F;
    block.autoscale = false;
    block.x_min = -2.0F;
    block.x_max = 2.0F;
    block.y_min = -1.5F;
    block.y_max = 1.5F;

    block.settingsChanged({}, gr::property_map{
                                 {"fft_size", 4UZ},
                                 {"num_averages", 2UZ},
                                 {"window", std::string("Rectangular")},
                                 {"sample_rate", 8.0F},
                                 {"update_ms", 125U},
                                 {"output_in_db", false},
                                 {"persistence", true},
                                 {"phosphor_intensity", 1.25F},
                                 {"phosphor_decay_ms", 750.0F},
                                 {"autoscale", false},
                                 {"x_min", -2.0F},
                                 {"x_max", 2.0F},
                                 {"y_min", -1.5F},
                                 {"y_max", 1.5F},
                             });
}

void testPowerSpectrumRegistered() {
    const auto keys = gr::globalBlockRegistry().keys();
    const bool foundPowerSpectrum = std::ranges::any_of(keys, [](const std::string& key) {
        return key.find("StudioPowerSpectrumSink") != std::string::npos;
    });
    assert(foundPowerSpectrum);
}

void testDefaultTransportAndCadence() {
    gr::studio::StudioPowerSpectrumSink<float> block{};
    assert(block.transport.value == "websocket");
    assert(block.update_ms == 10U);
}

void testFloatSpectrum() {
    gr::studio::StudioPowerSpectrumSink<float> block{};
    configureBlock(block);
    assert(block.in.min_samples == 4UZ);
    assert(block.in.max_samples == 4UZ);

    const std::array<float, 4UZ> impulse{1.0F, 0.0F, 0.0F, 0.0F};
    const std::array<float, 4UZ> zeros{0.0F, 0.0F, 0.0F, 0.0F};
    block.processSamples(std::span<const float>(impulse));
    block.processSamples(std::span<const float>(zeros));

    const std::string json = block.snapshotJson();
    assert(json.find("\"payload_format\":\"dataset-xy-json-v1\"") != std::string::npos);
    assert(json.find("\"points\":2") != std::string::npos);
    assert(json.find("\"update_ms\":125") != std::string::npos);
    assert(json.find("\"persistence\":true") != std::string::npos);
    assert(json.find("\"phosphor_intensity\":1.25") != std::string::npos);
    assert(json.find("\"phosphor_decay_ms\":750") != std::string::npos);
    assert(json.find("\"autoscale\":false") != std::string::npos);
    assert(json.find("\"x_min\":-2") != std::string::npos);
    assert(json.find("\"x_max\":2") != std::string::npos);
    assert(json.find("\"y_min\":-1.5") != std::string::npos);
    assert(json.find("\"y_max\":1.5") != std::string::npos);
    assert(json.find("[0,0.125]") != std::string::npos);
    assert(json.find("[2,0.125]") != std::string::npos);
}

void testDbFloorIsFinite() {
    gr::studio::StudioPowerSpectrumSink<float> block{};
    configureBlock(block);
    block.output_in_db = true;
    block.settingsChanged({}, gr::property_map{{"fft_size", 4UZ}});

    const std::array<float, 4UZ> zeros{0.0F, 0.0F, 0.0F, 0.0F};
    block.processSamples(std::span<const float>(zeros));

    const std::string json = block.snapshotJson();
    assert(json.find("-3.40282e+38") == std::string::npos);
    assert(json.find("-160") != std::string::npos);
}

void testComplexSpectrum() {
    using Complex = std::complex<float>;

    gr::studio::StudioPowerSpectrumSink<Complex> block{};
    configureBlock(block);
    assert(block.in.min_samples == 4UZ);
    assert(block.in.max_samples == 4UZ);

    const std::array<Complex, 4UZ> impulse{
        Complex{1.0F, 0.0F},
        Complex{0.0F, 0.0F},
        Complex{0.0F, 0.0F},
        Complex{0.0F, 0.0F},
    };
    block.processSamples(std::span<const Complex>(impulse));

    const std::string json = block.snapshotJson();
    assert(json.find("\"payload_format\":\"dataset-xy-json-v1\"") != std::string::npos);
    assert(json.find("\"points\":4") != std::string::npos);
    assert(json.find("[-4,0.25]") != std::string::npos);
    assert(json.find("[2,0.25]") != std::string::npos);
}

} // namespace

int main() {
    testPowerSpectrumRegistered();
    testDefaultTransportAndCadence();
    testFloatSpectrum();
    testDbFloorIsFinite();
    testComplexSpectrum();
    return 0;
}
