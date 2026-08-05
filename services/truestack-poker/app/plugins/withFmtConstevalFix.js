const { withPodfile, createRunOncePlugin } = require('@expo/config-plugins');

/**
 * Xcode 16.3+ ships a Clang that enforces C++20 consteval more strictly than
 * before, which breaks the `fmt` pod (pulled in transitively via RCT-Folly on
 * RN 0.76): build fails with "call to consteval function ... is not a
 * constant expression" in fmt/format-inl.h. Pre-defining FMT_CONSTEVAL as
 * empty makes fmt skip the consteval codepath entirely, working around the
 * compiler bug without needing an older Xcode. Podfile is regenerated on
 * every prebuild, so this has to be injected via a config plugin rather than
 * hand-edited.
 */
const withFmtConstevalFix = (config) =>
  withPodfile(config, (config) => {
    const marker = 'post_install do |installer|';
    if (!config.modResults.contents.includes(marker)) return config;
    if (config.modResults.contents.includes('FMT_CONSTEVAL=')) return config;

    const patch = `${marker}
    installer.pods_project.targets.each do |target|
      if target.name == 'fmt'
        target.build_configurations.each do |build_config|
          defs = build_config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)']
          defs = [defs] unless defs.is_a?(Array)
          defs << 'FMT_CONSTEVAL=' unless defs.include?('FMT_CONSTEVAL=')
          build_config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs
        end
      end
    end`;

    config.modResults.contents = config.modResults.contents.replace(marker, patch);
    return config;
  });

module.exports = createRunOncePlugin(withFmtConstevalFix, 'withFmtConstevalFix', '1.0.0');
