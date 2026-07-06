const expoPreset = require('expo/node_modules/babel-preset-expo');

module.exports = function(api) {
  api.cache(true);

  return {
    presets: [expoPreset],
    plugins: ['react-native-reanimated/plugin'],
  };
};
