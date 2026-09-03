import { Platform } from 'react-native';

const DEFAULT_PORT = 4000;
const DEFAULT_LAN_IP = '';

const PRODUCTION_SERVER_URL = '';

function defaultServerUrl(): string {
  if (DEFAULT_LAN_IP) {
    return `http://${DEFAULT_LAN_IP}:${DEFAULT_PORT}`;
  }
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${DEFAULT_PORT}`;
  }
  return `http://localhost:${DEFAULT_PORT}`;
}

export const SERVER_URL =
  !__DEV__ && PRODUCTION_SERVER_URL ? PRODUCTION_SERVER_URL : defaultServerUrl();
