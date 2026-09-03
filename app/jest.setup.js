// AsyncStorage needs its official mock under Jest -- there's no real native
// module to back it in a test runner.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Same story for NetInfo: swap the native module for its official mock so
// merely importing `services/queueProcessor.ts` doesn't blow up under Jest.
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
);

// Official gesture-handler test setup (mocks its native module surface).
import 'react-native-gesture-handler/jestSetup';
