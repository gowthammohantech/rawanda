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
