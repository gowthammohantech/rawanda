/** The equivalent data table of a chart (`AccessibleDataTable` from @laif/ui-web). */
import { AccessibleDataTable, type DataTableColumn } from "@laif/ui-web";

export type ChartTableProps<T> = {
  caption: string;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
};

export function ChartTable<T>({ caption, columns, rows, getRowId }: ChartTableProps<T>) {
  return (
    <AccessibleDataTable
      scrollable
      caption={caption}
      captionHidden
      columns={columns}
      rows={rows}
      getRowId={getRowId}
      hideCount
    />
  );
}
