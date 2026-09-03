module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // react-native-reanimated's plugin must always be listed last.
    'react-native-reanimated/plugin',
  ],
};
