const expoPreset = require('expo/node_modules/babel-preset-expo');

module.exports = function(api) {
  api.cache(true);

  return {
    presets: [expoPreset],
    // Reanimated/Worklets 的 babel plugin 由 babel-preset-expo (SDK 54) 偵測到
    // react-native-worklets 後自動加入。手動再加 'react-native-reanimated/plugin'
    // 會讓同一個 worklets plugin 被套用兩次，手機端 bundle 壞掉、Expo Go 打不開。
    // 不要加回來。
  };
};
