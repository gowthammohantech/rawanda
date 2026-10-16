import { createMemoryStoreAdapter, DEVICE_ID_META_KEY } from "@laif/repositories";
import { screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";

import { useRepository } from "../../providers.tsx";
import { renderShell } from "../../test/shell-harness.tsx";
import { getOrCreateDeviceId, shortDeviceId } from "../device.ts";

function DeviceIdProbe() {
  const repo = useRepository();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    void getOrCreateDeviceId(repo).then(setId);
  }, [repo]);
  return id === null ? null : <span data-testid="device-id">{id}</span>;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe("device id (HWM-01)", () => {
  it("is a UUID v4 persisted in store meta and identical across provider remounts", async () => {
    const store = createMemoryStoreAdapter();
    const first = await renderShell(<DeviceIdProbe />, { store, readyTestId: "device-id" });
    const id = screen.getByTestId("device-id").textContent ?? "";
    expect(id).toMatch(UUID_V4);
    expect(await store.getMeta(DEVICE_ID_META_KEY)).toBe(id);
    first.unmount();

    await renderShell(<DeviceIdProbe />, { store, readyTestId: "device-id" });
    expect(screen.getByTestId("device-id").textContent).toBe(id);
  });

  it("short form: first 8 hex digits as XXXX-XXXX", () => {
    expect(shortDeviceId("3f2a91c0-1b2c-4d3e-8f90-123456789abc")).toBe("3F2A-91C0");
    expect(shortDeviceId("dev")).toBe("DEV");
  });
});
