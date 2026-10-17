/**
 * CLN-02 `useIdempotentMutation`: key stability per form session, double click → one call,
 * same-key retry after a TIMEOUT (→ replay: one entity change, one change audit event, one
 * `sync.duplicate_suppressed`), CONFLICT surfaces `latest` and is not retryable.
 */
import type { WriteResult } from "@laif/contracts";
import type { AuditEvent, Review } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createTestClinicalRepo } from "../../test/test-repository.ts";
import { useIdempotentMutation } from "../useIdempotentMutation.ts";

const REVIEW = SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId;

/** One QueryClient per test (a wrapper re-created per render would drop the mutation state). */
function createWrapper() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return function Wrapper({ children }: { children?: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const fakeResult = (version: number): WriteResult<{ id: string }> => ({
  data: { id: "x" },
  eventId: "e",
  entityVersion: version,
  updatedAt: "2026-10-14T06:00:00.000Z",
  auditEventId: "a",
  replayed: false,
});

const clinician = () =>
  createTestClinicalRepo({ personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 });

describe("useIdempotentMutation", () => {
  it("keeps one key per form session and rotates it only after a success", async () => {
    let n = 0;
    const newKey = () => `key-${++n}`;
    const mutationFn = vi
      .fn<(v: number, key: string) => Promise<WriteResult<{ id: string }>>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(fakeResult(2));
    const { result, rerender } = renderHook(() => useIdempotentMutation({ mutationFn, newKey }), {
      wrapper: createWrapper(),
    });
    const first = result.current.idempotencyKey;
    rerender();
    expect(result.current.idempotencyKey).toBe(first);
    await act(() => result.current.submit(1));
    await waitFor(() => expect(result.current.error?.code).toBe("DEPENDENCY_UNAVAILABLE"));
    expect(result.current.idempotencyKey).toBe(first);
    await act(() => result.current.submit(1));
    expect(mutationFn.mock.calls.map((call) => call[1])).toEqual([first, first]);
    await waitFor(() => expect(result.current.idempotencyKey).not.toBe(first));
  });

  it("initialKey (CLN-07 restored draft) is used for the first submit, then rotated", async () => {
    const mutationFn = vi
      .fn<(v: number, key: string) => Promise<WriteResult<{ id: string }>>>()
      .mockResolvedValue(fakeResult(2));
    const { result } = renderHook(
      () => useIdempotentMutation({ mutationFn, initialKey: "draft-key", newKey: () => "next" }),
      { wrapper: createWrapper() },
    );
    expect(result.current.idempotencyKey).toBe("draft-key");
    await act(() => result.current.submit(1));
    expect(mutationFn.mock.calls[0]?.[1]).toBe("draft-key");
    await waitFor(() => expect(result.current.idempotencyKey).toBe("next"));
  });

  it("blocks re-entry while pending: a double click sends one call", async () => {
    let resolve: (value: WriteResult<{ id: string }>) => void = () => undefined;
    const mutationFn = vi.fn(
      () =>
        new Promise<WriteResult<{ id: string }>>((r) => {
          resolve = r;
        }),
    );
    const { result } = renderHook(() => useIdempotentMutation({ mutationFn }), {
      wrapper: createWrapper(),
    });
    let firstCall: Promise<unknown> = Promise.resolve();
    let second: unknown = "pending";
    act(() => {
      firstCall = result.current.submit(1);
      void result.current.submit(1).then((value) => {
        second = value;
      });
    });
    await waitFor(() => expect(result.current.isSubmitting).toBe(true));
    await waitFor(() => expect(second).toBeUndefined());
    await act(async () => {
      resolve(fakeResult(2));
      await firstCall;
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(result.current.isSubmitting).toBe(false);
  });

  it("retries a TIMEOUT with the same key → replayed, one change event + one duplicate_suppressed", async () => {
    const { repo, store } = await clinician();
    await repo.demo.setFaults({ timeoutRate: 1 });
    const { result } = renderHook(
      () =>
        useIdempotentMutation<{ expectedVersion: number }, Review>({
          mutationFn: (v, key) => repo.startReview({ reviewId: REVIEW, ...v }, key),
        }),
      { wrapper: createWrapper() },
    );
    const key = result.current.idempotencyKey;
    await act(() => result.current.submit({ expectedVersion: 1 }));
    await waitFor(() => expect(result.current.error?.code).toBe("TIMEOUT"));
    expect(result.current.canRetry).toBe(true);
    expect(result.current.idempotencyKey).toBe(key);

    await repo.demo.setFaults({ timeoutRate: 0 });
    let replay: WriteResult<Review> | undefined;
    await act(async () => {
      replay = await result.current.retry();
    });
    expect(replay?.replayed).toBe(true);
    expect(replay?.entityVersion).toBe(2);
    const events = await store.getAll<AuditEvent>("auditEvents");
    expect(
      events.filter((e) => e.action === "review.started" && e.entityId === REVIEW),
    ).toHaveLength(1);
    expect(events.filter((e) => e.action === "sync.duplicate_suppressed")).toHaveLength(1);
    expect((await repo.getReview(REVIEW))?.review.version).toBe(2);
  });

  it("CONFLICT surfaces latest and is not retryable", async () => {
    const { repo } = await clinician();
    const { result } = renderHook(
      () =>
        useIdempotentMutation<{ expectedVersion: number }, Review>({
          mutationFn: (v, key) => repo.startReview({ reviewId: REVIEW, ...v }, key),
        }),
      { wrapper: createWrapper() },
    );
    await act(() => result.current.submit({ expectedVersion: 7 }));
    await waitFor(() => expect(result.current.error?.code).toBe("CONFLICT"));
    expect((result.current.error?.latest as Review | undefined)?.id).toBe(REVIEW);
    expect(result.current.canRetry).toBe(false);
  });
});
