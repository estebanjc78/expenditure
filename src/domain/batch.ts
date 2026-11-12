import type { DatabaseSync } from "node:sqlite";
import { addMovement } from "./movements.js";
import type { MovementInput } from "./types.js";

export const MAX_BATCH = 100;

export interface BatchItemResult {
  readonly index: number;
  readonly id?: number;
  readonly duplicate?: boolean;
  readonly needsClassification?: boolean;
  readonly error?: string;
}

export interface BatchResult {
  readonly results: BatchItemResult[];
  readonly summary: { registered: number; duplicates: number; failed: number };
}

/** Returns the ids (in order, deduplicated) with no movement whose source_id is the id or starts with `<id>#`. */
export function filterUnregistered(db: DatabaseSync, sourceIds: readonly string[]): string[] {
  // Bound parameters only; prefix compared with substr, so LIKE wildcards never apply.
  const stmt = db.prepare(
    "SELECT 1 FROM movements WHERE source_id = ? OR substr(source_id, 1, length(?) + 1) = ? || '#' LIMIT 1",
  );
  return [...new Set(sourceIds)].filter((id) => stmt.get(id, id, id) === undefined);
}

function registerOne(db: DatabaseSync, input: unknown, index: number): BatchItemResult {
  try {
    const r = addMovement(db, input as MovementInput);
    return { index, id: r.id, duplicate: r.duplicate, needsClassification: r.needsClassification };
  } catch (err) {
    return { index, error: err instanceof Error ? err.message : String(err) };
  }
}

export function addMovements(db: DatabaseSync, inputs: readonly unknown[]): BatchResult {
  if (inputs.length > MAX_BATCH) {
    throw new Error(`Too many movements: ${inputs.length} (max ${MAX_BATCH})`);
  }
  db.exec("BEGIN");
  let results: BatchItemResult[];
  try {
    results = inputs.map((input, i) => registerOne(db, input, i));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return {
    results,
    summary: {
      registered: results.filter((r) => r.id !== undefined && !r.duplicate).length,
      duplicates: results.filter((r) => r.duplicate === true).length,
      failed: results.filter((r) => r.error !== undefined).length,
    },
  };
}
