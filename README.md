# Kanban Board — React Native Machine Test

A real-time, offline-first, drag-and-drop Kanban board built for the "React
Native Developer — Machine Test" brief (2–4 yrs, mid level / higher
difficulty). Three columns, gesture-driven drag-and-drop, optimistic UI with
server-reject rollback, a persisted offline action queue, image attachments,
search/filter, and undo-on-delete.

The repo is two packages:

```
kanban-collab-board/
  app/     the React Native app (TypeScript, bare RN CLI)
  server/  a small in-memory Socket.IO server the app syncs through
```

## Why this exists / what it's proving

The brief is explicit that the CRUD/UI is the easy 80%; the point is
**optimistic updates + rollback + an offline queue + cross-session sync**,
all reconciled correctly. Almost everything interesting in this repo lives
in `app/src/engine/` and `app/src/services/queueProcessor.ts` — read the
[Sync & reconciliation strategy](#sync--reconciliation-strategy) section
below before diving into the code.

---

## Quick start

You need two terminals: one for the mock server, one for the RN app.

### 1. Start the mock server

```bash
cd server
npm install
npm start
# -> Kanban mock server listening on http://localhost:4000
```

This holds the board in memory (no database) — restarting it resets to the
seed board. It deliberately **rejects** some writes so you can see optimistic
rollback in action (see [Demoing rejection/rollback](#demoing-rejectionrollback)).

### 2. Point the app at the server

Open `app/src/services/config.ts`. The defaults already handle the two
simulator cases:

- **iOS Simulator**: `http://localhost:4000` — works out of the box.
- **Android Emulator**: `http://10.0.2.2:4000` — works out of the box
  (`10.0.2.2` is the emulator's alias for your host machine).
- **A physical device**: neither of those resolves to your laptop. Set
  `DEFAULT_LAN_IP` in `config.ts` to your machine's LAN IP (e.g.
  `'192.168.1.23'`) and make sure the phone is on the same Wi-Fi network as
  the machine running the server.

### 3. Install and run the app

```bash
cd app
npm install

# iOS (macOS + Xcode only)
cd ios && pod install && cd ..
npm run ios

# Android (Android Studio / SDK + an emulator running, or a device attached)
npm run android
```

> **A note on how this repo was built:** it was scaffolded and written in a
> Linux cloud sandbox with no iOS/Android toolchain, so `pod install` and an
> actual on-device/simulator run could not be exercised end-to-end here —
> there is no Xcode or Android SDK in that environment. The native project
> was generated via the real `react-native` template (not hand-rolled), all
> app code is real TypeScript RN code, and the full automated test suite
> (`npm test`, see below) passes. But you should expect to spend a few
> minutes on the usual first-run friction (a `pod install` hiccup, a Gradle
> sync, etc.) — see [Known limitations](#known-limitations-and-honest-caveats).

### 4. Run two sessions to see sync

Run the app in two simulators (or one simulator + one device) at once,
pointed at the same server, to see the "near real-time sync across two
sessions" requirement: edit/move/delete a card in one, watch it appear in
the other within ~1 second.

### 5. Run the tests

```bash
cd app
npm test
```

29 tests, all passing, covering the reconciliation engine and the offline
queue specifically (see below).

---

## Sync & reconciliation strategy

This is the part the brief cares most about, so here's the actual design,
not just a feature list.

### The core idea: patches, not snapshots

Every user action (create/update/delete/move a card) is turned into a pair
of **patches** by `app/src/engine/actions.ts`:

- a **forward patch** — applied immediately to the board store, for
  optimistic UI ("upsert this card" / "remove this card")
- an **inverse patch** — what would undo it, precomputed at the moment the
  action is built (using the pre-action state), stored alongside the action

Both patch types are executed by one pure function,
`applyPatch(state, patch)` in `app/src/engine/patch.ts`. That's deliberate:
optimistic-apply, rollback-on-reject, and merging-a-remote-update all funnel
through the exact same function. There's no separate "undo code path" that
can drift out of sync with the "do" code path, and the whole thing is
trivially unit-testable with no store, no socket, and no UI in sight (see
`app/__tests__/engine.test.ts`).

Because a patch only ever touches *one card's row* (`{kind: 'upsertCard',
card}` or `{kind: 'removeCard', cardId}`), rolling back action A can never
clobber some other action B that's concurrently in flight against a
different card — there's no risk of a coarse "restore the whole board to
its pre-action snapshot" stepping on unrelated optimistic changes.

### The flow, end to end

1. **User does something** (e.g. drags a card to another column). The UI
   handler in `BoardScreen.tsx` calls a builder like `buildMoveCardAction`,
   which reads current state and returns `{ payload, forwardPatch,
   inversePatch }`.
2. **Optimistic apply, instantly.** `dispatchAction()` in
   `queueProcessor.ts` applies `forwardPatch` to the Zustand board store
   right away — no network round trip, no loading spinner. This is what
   "optimistic UI" means in this app: line one of `dispatchAction`.
3. **Enqueue.** The action (with both patches and the network payload)
   is pushed onto a **persisted FIFO queue** (`useQueueStore`, backed by
   AsyncStorage via `zustand/persist`). This is the single offline queue —
   whether the device is online or offline, every action goes through it.
4. **The queue processor drains it.** `processQueue()` picks the front of
   the queue, sends it over the socket, and waits for an ack:
   - **Server confirms (`ok: true`)** → the confirmed patch (with the real
     server `updatedAt`/`version`) replaces the optimistic guess, the
     action is removed from the queue.
   - **Server rejects (`ok: false`, a real error)** → the `inversePatch` is
     applied (rollback), the action is removed from the queue, and an error
     toast appears. This is the "if the server rejects the change, the UI
     rolls back and shows an error" requirement.
   - **Timeout / no ack** → treated as *unknown*, not a rejection. The
     action stays in the queue with `status: 'pending'`; nothing is rolled
     back, because we genuinely don't know if the server saw it. It's
     retried later (next reconnect, or a 5s safety-net timer).
5. **Offline is just "step 4 can't run yet."** If the device has no
   connectivity (or the socket isn't connected), `processQueue()` simply
   returns without sending — everything from step 2–3 already happened, so
   the UI already reflects the change, now marked with a "Pending sync"
   badge (cross-referenced from the queue). The moment connectivity returns
   (a NetInfo listener, or the socket reconnecting), the queue drains
   automatically, strictly in the order actions were originally created —
   see `app/__tests__/queueProcessor.test.ts` for the FIFO-ordering test.
6. **Remote updates from another session** arrive as `board:remote-update`
   broadcasts and go through `mergeConfirmedPatch()` (see next section).

### Conflict handling

Two situations can conflict with a locally-optimistic card:

- **A remote broadcast arrives for a card we have a pending local action
  on.** `mergeConfirmedPatch()` checks the local queue first
  (`queueHasPendingActionForCard`) — if there's an in-flight local action
  for that card, the remote patch is **ignored for now**. The local
  optimistic value wins until our own action resolves (confirms or rolls
  back), at which point the server's view naturally takes over. This avoids
  a visible "flicker" where your own edit briefly reverts because another
  session's older update raced in.
- **An out-of-order / stale broadcast.** Every card carries a
  server-assigned `version`, bumped on every confirmed write.
  `mergeConfirmedPatch` ignores an incoming patch whose `version` is not
  newer than what's already stored — cheap protection against delivery
  reordering.
- **Two sessions edit the same card with nothing pending locally.** The
  server is the single source of truth and confirms writes in the order it
  receives them, so this resolves as **last-write-wins** by construction —
  whichever write reaches the server second simply becomes the new
  confirmed state, broadcast to everyone. No merge UI, no field-level
  merging; this is a deliberate scope decision explained below.

This is a simple strategy on purpose. A production Trello clone would
likely want field-level merging or a CRDT for text fields; for a 4–6 hour
test, "single source of truth + don't clobber my own in-flight edit" is the
right amount of sophistication to build *and* to explain in an interview.

### Everything above is unit-tested, not just described

- `app/__tests__/engine.test.ts` — `applyPatch`, every action builder's
  forward/inverse pair, fractional drag-and-drop ordering, and
  `mergeConfirmedPatch`'s three conflict rules.
- `app/__tests__/queueProcessor.test.ts` — FIFO ordering, optimistic apply
  before any network call, confirm-replaces-optimistic, reject-rolls-back
  (+ toast), timeout-stays-pending-not-rolled-back, offline-doesn't-send,
  and replay-on-reconnect. The real socket module is mocked out so these
  run in milliseconds with no server needed.
- `app/__tests__/queuePersistence.test.ts` — the queue is actually written
  to AsyncStorage on enqueue/remove, and a **fresh store instance**
  (simulating an app relaunch) rehydrates a previously-persisted queue.

Run them with `cd app && npm test`.

---

## Feature checklist (brief → implementation)

| Requirement | Where |
|---|---|
| 3+ columns, cards CRUD | `Column.tsx`, `CardEditModal.tsx`, `BoardScreen.tsx` |
| Real drag gesture (not buttons) | `components/dnd/DraggableCard.tsx` — `Gesture.Pan().activateAfterLongPress(220)` from react-native-gesture-handler, driven by react-native-reanimated shared values |
| Optimistic updates + rollback on reject | `dispatchAction` / `processQueue` in `services/queueProcessor.ts` |
| Near real-time sync (2 sessions) | `server/src/index.js` (Socket.IO broadcast) + `onRemoteUpdate` in `services/socket.ts` |
| Offline queue, visibly "pending sync" | `useQueueStore` (persisted) + the pending badge in `CardVisual.tsx` |
| Attachments (camera/gallery, thumbnail) | `CardEditModal.tsx` via `react-native-image-picker` |
| Search/filter by keyword or assignee | `SearchBar.tsx` + `matchesQuery` in `BoardScreen.tsx` |
| Undo (~5s) on delete | `handleDelete` in `BoardScreen.tsx` + `Toast.tsx` |
| TypeScript | the whole app (`tsc --noEmit` is clean) |
| gesture-handler + reanimated for DnD | `components/dnd/*` |
| Reconciliation layer, state mgmt of choice | Zustand (`store/*`) + `engine/patch.ts` |
| Local persistence for offline queue | `useQueueStore` via `zustand/persist` + AsyncStorage |
| Automated test on offline-queue/reconciliation | `__tests__/engine.test.ts`, `__tests__/queueProcessor.test.ts`, `__tests__/queuePersistence.test.ts` |
| Open-source libraries only | everything in `package.json` is OSS; the mock server needs no account/paid service |

## Demoing rejection/rollback

The mock server rejects a write in two ways, so you can trigger it on
demand for a recording rather than waiting on luck:

1. **Deterministic:** give a card a title containing the word `FAIL`
   (case-insensitive) — e.g. "This will FAIL". Guaranteed rejection.
2. **Random:** ~8% of all writes are rejected regardless, to simulate a
   flaky backend and prove the app survives an *unscripted* rejection too.

Either way you'll see: the card updates instantly (optimistic), then a
moment later reverts and a toast explains why.

## Demoing the offline queue

1. Turn on Airplane Mode (or stop the `server` process) on/while running
   the app.
2. Create/edit/move/delete a few cards — notice they apply instantly and
   show a "Pending sync" badge, and the header shows an "N pending sync"
   counter plus a red offline banner.
3. Kill and relaunch the app while still offline — the queue survives
   (it's persisted), the badges are still there.
4. Restore connectivity (disable Airplane Mode / restart the server) — the
   queue drains automatically, in the order the actions were made.

## Known limitations and honest caveats

- **Built without a device/simulator available.** This was written in a
  sandboxed Linux environment with no Xcode/Android SDK, so the drag gesture
  math (`components/dnd/DragProvider.tsx`) and the native permission wiring
  are implemented to the best of my knowledge of the gesture-handler v2 /
  reanimated v3 APIs but haven't been visually verified on a simulator. If
  something's slightly off on first run, it's most likely in the hit-testing
  offsets in `DragProvider.endDrag` or the grab-offset constants in
  `DraggableCard.tsx` — both are small, well-isolated, and commented.
- **No auto-scroll while dragging.** Both the horizontal column row and each
  column's vertical list disable scrolling for the duration of a drag (see
  the comment in `DragProvider.tsx` for why — it's what lets the hit-testing
  avoid tracking scroll offsets). Dragging to a column that's off-screen, or
  to a spot below the fold in a tall column, isn't supported. A real product
  would add edge-triggered auto-scroll here.
- **No screen recording included.** The brief asks for one; since this was
  built without a runnable simulator/device in this environment, I couldn't
  record the app in action. Everything else — code, README, automated
  tests — is complete; the recording is the one deliverable you'll need to
  produce yourself by actually running the app.
- **Card IDs are client-generated and treated as canonical.** The mock
  server accepts whatever id the client assigns on create rather than
  reassigning its own — simplifies the demo (no id-remapping step needed
  between the optimistic card and the confirmed one) at the cost of not
  matching how most real backends behave (auto-increment/UUID assigned
  server-side). Noted here so it's an explicit, explainable decision rather
  than an oversight.
- **IDs use `Date.now() + Math.random()`, not `uuid`.** Avoids needing a
  `crypto.getRandomValues` polyfill wired into the RN entry point for a
  4-6 hour test; see the comment in `src/utils/id.ts`.
- **Conflict resolution is last-write-wins**, not field-level merging — a
  deliberate scope call, explained in [Conflict handling](#conflict-handling)
  above.

## Project structure

```
app/src/
  types/            Card, Column, BoardState, QueueAction, BoardPatch, ...
  engine/           applyPatch (pure), action builders, fractional ordering
  store/            Zustand stores: board, offline queue (persisted), network, toast
  services/         socket.ts (Socket.IO client), queueProcessor.ts (the FIFO drain loop), config.ts
  screens/          BoardScreen.tsx
  components/       Column, CardVisual, SearchBar, Toast, modals/CardEditModal
  components/dnd/   DragProvider (context + hit-testing), DraggableCard, DragLayer
  __tests__/        engine, queueProcessor, queuePersistence, App (see App.test.tsx for why it's minimal)
server/src/index.js  in-memory board + Socket.IO mock backend
```
