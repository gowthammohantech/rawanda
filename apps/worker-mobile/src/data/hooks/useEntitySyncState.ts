/**
 * Per-entity sync state (HWM-02): FND-02 `deriveSyncState(entityId, ops)` over the entity's ops,
 * with the worker label: Saved on this device | Syncing | Synced | Needs your decision |
 * Not accepted | Blocked (device access revoked).
 */
import { deriveSyncState, type EntitySyncState } from "@laif/domain";
import type { TranslationKey } from "@laif/ui-native";
import { useQuery } from "@tanstack/react-query";

import { useRepository } from "../../providers.tsx";
import { workerKeys } from "../queryKeys.ts";

export const ENTITY_SYNC_LABEL_KEYS = {
  saved_locally: "worker:sync.state.pending",
  syncing: "worker:sync.state.syncing",
  synced: "worker:sync.state.synced",
  conflict: "worker:sync.state.conflict",
  rejected: "worker:sync.state.rejected",
  blocked: "worker:sync.state.blocked",
} as const satisfies Record<EntitySyncState, TranslationKey>;

export type EntitySyncView = {
  state: EntitySyncState;
  labelKey: (typeof ENTITY_SYNC_LABEL_KEYS)[EntitySyncState];
  loading: boolean;
};

export function useEntitySyncState(entityId: string): EntitySyncView {
  const repo = useRepository();
  const query = useQuery({
    queryKey: workerKeys.entity(entityId),
    queryFn: async () => deriveSyncState(entityId, await repo.sync.list({ entityId })),
  });
  const state = query.data ?? "synced";
  return { state, labelKey: ENTITY_SYNC_LABEL_KEYS[state], loading: query.isPending };
}
