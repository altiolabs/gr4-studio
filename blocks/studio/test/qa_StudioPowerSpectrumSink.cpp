#include <cassert>
#include <array>
#include <complex>
#include <cstddef>
#include <span>
#include <string>

#include <gnuradio-4.0/Tag.hpp>
#include <gnuradio-4.0/studio/StudioPowerSpectrumSink.hpp>

namespace {

template<typename TBlock>
void configureBlock(TBlock& block) {
    block.fft_size = 4UZ;
    block.num_averages = 2UZ;
    block.window = std::string("Rectangular");
    block.sample_rate = 8.0F;
    block.output_in_db = false;

    block.settingsChanged({}, gr::property_map{
                                 {"fft_size", 4UZ},
                                 {"num_averages", 2UZ},
                                 {"window", std::string("Rectangular")},
                                 {"sample_rate", 8.0F},
                             });
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
    testFloatSpectrum();
    testDbFloorIsFinite();
    testComplexSpectrum();
    return 0;
}
