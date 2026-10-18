/** React view of the simulated device clock (offset + last detected drift). */
import { useStore } from "zustand";

import { useDeviceClockStore } from "../providers.tsx";
import type { DeviceClockState, DeviceClockStore } from "./clockDrift.ts";

export function useDeviceClock(): DeviceClockState & Pick<DeviceClockStore, "setOffset"> {
  const clock = useDeviceClockStore();
  const state = useStore(clock.store);
  return { ...state, setOffset: clock.setOffset };
}
