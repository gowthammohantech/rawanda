/**
 * Per-install device id (HWM-01 task 2): store meta `device_id`, created once as a platform UUID
 * (`expo-crypto` `randomUUID` on device — the repository's id generator). Only "Reset demo"
 * clears it.
 */
import type { CareRepository } from "@laif/repositories";

export function getOrCreateDeviceId(repo: Pick<CareRepository, "device">): Promise<string> {
  return repo.device.getOrCreateDeviceId();
}

/** Short form for Settings: first 8 hex digits as `XXXX-XXXX`. */
export function shortDeviceId(deviceId: string): string {
  const hex = deviceId.replace(/[^0-9a-f]/giu, "").toUpperCase();
  const head = (hex.length >= 8 ? hex : deviceId.toUpperCase()).slice(0, 8);
  return head.length > 4 ? `${head.slice(0, 4)}-${head.slice(4)}` : head;
}
