/**
 * @format
 *
 * A full `renderer.create(<App />)` smoke test would need real device
 * behaviour mocked out for the socket connection, its reconnection timers,
 * and NetInfo/AsyncStorage/gesture-handler/image-picker all lining up at
 * once -- worthwhile for a larger project, but out of scope for this test's
 * time box next to the required offline-queue/reconciliation coverage in
 * engine.test.ts, queueProcessor.test.ts, and queuePersistence.test.ts.
 * This just confirms the app's entry point is wired up correctly.
 */
import App from '../App';

it('exports a React component from the app entry point', () => {
  expect(typeof App).toBe('function');
});
