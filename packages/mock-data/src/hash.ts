/** Dataset fingerprint (FND-05 task 9): `fnv1a64Hex(canonicalJson(seed))`. Not tamper-proof. */
import { canonicalJson, fnv1a64Hex } from "@laif/domain";

export function datasetHash(dataset: unknown): string {
  return fnv1a64Hex(canonicalJson(dataset));
}
