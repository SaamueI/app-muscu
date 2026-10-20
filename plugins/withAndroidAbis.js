// Config plugin Expo : limite les architectures CPU compilées dans l'APK.
//
// `android/` est régénéré par `expo prebuild`, qui remet
// `reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64` dans
// `android/gradle.properties`. Ce plugin réécrit la valeur à chaque prebuild.
// x86/x86_64 ne servent qu'aux émulateurs PC et doublent le temps de
// compilation C++ (reanimated, worklets, screens…).
const { withGradleProperties } = require('expo/config-plugins');

const ABIS = 'armeabi-v7a,arm64-v8a';

module.exports = function withAndroidAbis(config) {
  return withGradleProperties(config, (cfg) => {
    const item = cfg.modResults.find(
      (p) => p.type === 'property' && p.key === 'reactNativeArchitectures',
    );
    if (item) {
      item.value = ABIS;
    } else {
      cfg.modResults.push({ type: 'property', key: 'reactNativeArchitectures', value: ABIS });
    }
    return cfg;
  });
};
