/**
 * Lightweight id generator.
 *
 * We deliberately avoid the `uuid` package here: it needs a
 * `crypto.getRandomValues` polyfill wired into the RN entry point to work,
 * which is one more moving native-ish piece for a 4-6 hour test. This is
 * good enough uniqueness for a demo/offline-queue app (timestamp + random
 * base36 suffix) and needs zero setup.
 */
export function generateId(prefix: string = 'id'): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
