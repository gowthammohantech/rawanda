# CareConnect Worker (Health Worker Mobile, demo)

Expo SDK 58 + Expo Router app for community health workers. **Demonstration only — synthetic
data, simulated sign-in, simulated sync server. Not for clinical use.** The local database is
**not encrypted** in this demo (Expo Go cannot encrypt SQLite; a production build needs an
encrypted store).

## Run

```bash
pnpm install
pnpm --filter @laif/worker-mobile start      # Expo dev server (scan with Expo Go)
pnpm --filter @laif/worker-mobile web        # Expo web target (react-native-web)
pnpm --filter @laif/worker-mobile test       # Vitest (jsdom + react-native-web)
pnpm --filter @laif/worker-mobile test:maestro  # device suite (.maestro/, Expo Go / dev build)
```

`EXPO_PUBLIC_LAIF_E2E=1` removes the simulated sync latency (E2E builds).

## Simulation controls

All of them are labelled as simulations in the UI. Nothing leaves the device.

| Where                                         | Control                                                   | Effect                                                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings → CONNECTION                         | Offline (simulated)                                       | Nothing is sent; changes stay "Saved on this device".                                                                                                                  |
| Settings → Network simulation                 | Response delay, failure type + rate                       | Server error / unavailable / lost reply on sync requests.                                                                                                              |
| Network simulation → Changes by others        | Simulate a clinician update · Make the next sync conflict | Version conflict → "Needs your decision".                                                                                                                              |
| Network simulation → Changes by others        | Simulate task reassignment                                | The next update of that task is "Not accepted" (reassigned) and kept on the device.                                                                                    |
| Network simulation → Device clock (simulated) | Correct / +10 min / −30 min                               | After the next sync a drift over 5 min shows a warning in Sync and Settings.                                                                                           |
| Settings → DEMO CONTROLS                      | Simulate device revocation                                | Lost-device response: `/revoked`, no patient data, nothing sent, items kept. "Restore device (demo only)" syncs them once.                                             |
| Settings → DEMO CONTROLS                      | Activity log                                              | Device + simulated-server audit events (read-only, filter by type).                                                                                                    |
| Settings → DEMO CONTROLS                      | Reset demo                                                | Lists what will be removed; type `RESET`. Restores the seed on the device and the simulated server, resets the demo clock, signs out, new device id. Language is kept. |

## Demo click-path (worker part of the 15-minute script)

**Minutes 2–5 — offline screening, restart, reconnect, sync**

1. Sign in: choose the first demo profile (_Oxavel Oquumbra_, community health worker, Alpha-1) → Continue → confirm the facility.
2. Avatar → Settings → CONNECTION → switch **Offline (simulated)** on.
3. **Screen** tab → choose a patient → BP 128/82 → Review → Save → "Saved on this device".
4. Close the app completely and open it again: Today shows 1 waiting to sync.
5. Settings → switch Offline off → **Sync** tab → Sync now → "Synced recently".

**Minutes 8–10 — contact and follow-up outcome**

1. **Tasks** tab → Overdue → open the task → Record contact attempt → Reached → Save.
2. Record outcome → Attended + evidence type → Save → "Saved on this device" → Sync now.
3. The clinician confirms in the Clinical web app (separate demo dataset).

**Minutes 13–15 — conflict, revocation and reset (worker side)**

1. Network simulation → pick a task → Simulate a clinician update → record an attempt on it
   offline → online → Sync → **Needs your decision** → Re-apply my update.
2. Settings → Simulate device revocation → revoked screen (no patient data) → Restore device.
3. Settings → Reset demo → type `RESET` → sign-in screen with "Demo data restored".
