/**
 * Switches the active facility among the persona's permitted ones (CLN-01 task 8): clears the
 * query cache (every key is facility-scoped, and the repository actor is narrowed to the active
 * facility) and confirms with a toast. Used by the persona menu and the patient-search facility
 * filter (CLN-03).
 */
import { useToast, useTx } from "@laif/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { facilityLabel } from "../app/persona-labels.ts";
import { useSession } from "./useSession.ts";

export function useSwitchFacility(): (facilityId: string) => boolean {
  const t = useTx();
  const { store } = useSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useCallback(
    (facilityId: string) => {
      const before = store.state()?.activeFacilityId;
      if (!store.setActiveFacility(facilityId)) return false;
      if (before !== facilityId) {
        queryClient.clear();
        toast({
          title: t("clinical:common.facilitySwitched", { facility: facilityLabel(facilityId, t) }),
        });
      }
      return true;
    },
    [store, queryClient, toast, t],
  );
}
