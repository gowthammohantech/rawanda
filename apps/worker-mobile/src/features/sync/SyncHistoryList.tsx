/**
 * Synced recently (HWM-09 task 5): the last 20 settled items (acknowledged, or withdrawn by a
 * "keep latest" decision), newest first, with the server event id in short form.
 */
import type { SyncOpRow } from "../../data/syncCenter.ts";
import { OpRow } from "./OpRow.tsx";
import { QueueSection } from "./QueueSection.tsx";

export function SyncHistoryList({
  rows,
  onOpen,
}: {
  rows: readonly SyncOpRow[];
  onOpen: (opId: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <QueueSection section="synced" count={rows.length}>
      {rows.map((row) => (
        <OpRow key={row.op.id} row={row} section="synced" onOpen={onOpen} />
      ))}
    </QueueSection>
  );
}
