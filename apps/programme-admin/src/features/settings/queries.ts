/**
 * Settings queries / mutations (ADM-09):
 * - `adminSettingsQuery` / `useAdminSettings` — `adminKeys.settings()` (the threshold in force).
 *   Kept for the whole session (`staleTime` / `gcTime` Infinity): every dashboard needs it, and a
 *   change writes the new value into the cache before anything recomputes.
 * - `useUpdateThreshold` — `repo.updateAdminSettings` with the dialog's idempotency key; success
 *   stores the new settings and invalidates `adminKeys.all` ("dashboards recalculated"; every
 *   derived key carries the threshold, so no number computed at the old k is reused).
 */
import type { AdminSettings, WriteResult } from "@laif/contracts";
import type { AdminSettingsUpdateCall, CareRepository } from "@laif/repositories";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAdminSession, useRepository } from "../../app/providers.tsx";
import { adminKeys } from "../../lib/queryKeys.ts";

export function adminSettingsQuery(repo: Pick<CareRepository, "getAdminSettings">) {
  return {
    queryKey: adminKeys.settings(),
    queryFn: (): Promise<AdminSettings> => repo.getAdminSettings(),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  } as const;
}

export function useAdminSettings() {
  const repo = useRepository();
  const signedIn = useAdminSession((s) => s.session !== null);
  return useQuery({ ...adminSettingsQuery(repo), enabled: signedIn });
}

type UpdateVars = { input: Omit<AdminSettingsUpdateCall, "correlationId">; key: string };

export function useUpdateThreshold() {
  const repo = useRepository();
  const client = useQueryClient();
  const correlationId = useAdminSession((s) => s.session?.correlationId);
  return useMutation<WriteResult<AdminSettings>, Error, UpdateVars>({
    mutationFn: ({ input, key }) =>
      repo.updateAdminSettings(
        { ...input, ...(correlationId === undefined ? {} : { correlationId }) },
        key,
      ),
    onSuccess: async (result) => {
      client.setQueryData(adminKeys.settings(), result.data);
      await client.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
}
