import { Platform } from 'react-native';

const DEFAULT_PORT = 4000;
const DEFAULT_LAN_IP = '';

const PRODUCTION_SERVER_URL = 'https://task-board-glsc.onrender.com';

function defaultServerUrl(): string {
  if (DEFAULT_LAN_IP) {
    return `http://${DEFAULT_LAN_IP}:${DEFAULT_PORT}`;
  }
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${DEFAULT_PORT}`;
  }
  return `http://localhost:${DEFAULT_PORT}`;
}

// Precedence: an explicit LAN IP (for local server work) wins, then the
// deployed server if one is configured, then the platform default. This means
// dev builds also talk to the deployed server unless you set DEFAULT_LAN_IP.
export const SERVER_URL = DEFAULT_LAN_IP
  ? `http://${DEFAULT_LAN_IP}:${DEFAULT_PORT}`
  : PRODUCTION_SERVER_URL || defaultServerUrl();
