/**
 * Wallet event bus (CTZ-02 task 9). `consentWithdrawn` fires after a successful withdrawal;
 * CTZ-05 registers its "cancel scheduled reminders" handler here (the repository already
 * cancels the stored reminders — this is for on-device notification scheduling).
 */
export type ConsentWithdrawnEvent = { patientId: string; personaId: string | null };
type Listener = (event: ConsentWithdrawnEvent) => void;

const listeners = new Set<Listener>();

/** Subscribes; returns the unsubscribe function. */
export function onConsentWithdrawn(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitConsentWithdrawn(event: ConsentWithdrawnEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      // A failing handler never blocks the withdrawal.
    }
  }
}

/**
 * CTZ-05: the demo clock moved (Demo tools +1 day / +7 days / baseline). The reminder processor
 * listens and runs the simulated delivery at once.
 */
const clockListeners = new Set<() => void>();

export function onDemoClockChanged(listener: () => void): () => void {
  clockListeners.add(listener);
  return () => {
    clockListeners.delete(listener);
  };
}

export function emitDemoClockChanged(): void {
  for (const listener of [...clockListeners]) {
    try {
      listener();
    } catch {
      // Never blocks the demo tool.
    }
  }
}
