import { getTableName, sql, type Column } from "drizzle-orm";

/**
 * Table-qualified column reference (`"notes"."id"`) for correlated subqueries in a select list.
 * Drizzle renders select-list columns unqualified in single-table queries, so `${notes.id}` inside
 * `(select … from note_mentions m join people p … where m.note_id = ${notes.id})` would silently
 * bind to `p.id`. Use `qcol(notes.id)` there instead.
 */
export function qcol(column: Column) {
  return sql.raw(`"${getTableName(column.table)}"."${column.name}"`);
}
