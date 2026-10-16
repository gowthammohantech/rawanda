import type { DistrictId } from "../ids.ts";
import type { PersistedEntity } from "./base.ts";

/** Fictional district; every name includes "Demo" (FND-05). */
export type District = PersistedEntity & {
  id: DistrictId;
  name: string;
  code: string;
};
