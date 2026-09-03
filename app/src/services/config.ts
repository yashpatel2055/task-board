import { Platform } from 'react-native';

/**
 * The mock server runs on your machine during development, and React
 * Native can't resolve "localhost" the way a browser tab can:
 *   - iOS Simulator: `localhost` works fine (it shares the host's network).
 *   - Android Emulator: use `10.0.2.2`, which the emulator maps to the host.
 *   - A physical device (either OS): use your machine's LAN IP, e.g.
 *     `http://192.168.1.23:4000`, and make sure the phone is on the same
 *     Wi-Fi network as the machine running `npm run dev` in /server.
 *
 * Simplest override for a real device: set EXPO_PUBLIC_... no wait, this is
 * bare RN, so just edit DEFAULT_LAN_IP below, or wire this up to
 * react-native-config / .env if you prefer.
 */
const DEFAULT_PORT = 4000;
const DEFAULT_LAN_IP = ''; // e.g. '192.168.1.23' -- fill in for physical-device testing

function defaultServerUrl(): string {
  if (DEFAULT_LAN_IP) {
    return `http://${DEFAULT_LAN_IP}:${DEFAULT_PORT}`;
  }
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${DEFAULT_PORT}`;
  }
  return `http://localhost:${DEFAULT_PORT}`;
}

export const SERVER_URL = defaultServerUrl();
