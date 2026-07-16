// Storage layer: JSON persistence for seen IDs, the item catalog, and the
// last-run status. This is the "memory" that makes daily runs incremental.

import fs from "node:fs";
import { DATA_DIR, PUBLIC_DATA_DIR, PATHS } from "./config.js";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, obj) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf-8");
}

/** @returns {Set<string>} */
export function loadSeen() {
  const data = readJson(PATHS.seen, { ids: [] });
  return new Set(data.ids || []);
}

/** @param {Set<string>} ids */
export function saveSeen(ids) {
  writeJson(PATHS.seen, {
    updated_at: new Date().toISOString(),
    ids: [...ids].sort(),
  });
}

/** @returns {{updated_at: string|null, items: object[]}} */
export function loadCatalog() {
  return readJson(PATHS.catalog, { updated_at: null, items: [] });
}

/**
 * Replace the catalog with exactly the given snapshot of items.
 * The brief tracks only what CERT-In currently highlights on its homepage,
 * so each run writes the current set rather than accumulating history.
 * @param {object[]} items
 * @returns {number} catalog size
 */
export function saveCatalog(items) {
  const list = (items || []).filter((it) => it && it.id);
  writeJson(PATHS.catalog, {
    updated_at: new Date().toISOString(),
    items: list,
  });
  return list.length;
}

/**
 * Write the last-run status file.
 * @param {{mode: string, totalKnown: number, newIds: string[]}} info
 */
export function writeLatest({ mode, totalKnown, newIds }) {
  const ids = newIds || [];
  writeJson(PATHS.latest, {
    mode,
    checked_at: new Date().toISOString(),
    total_known: totalKnown,
    new_count: ids.length,
    new_ids: ids,
  });
}

export function loadLatest() {
  return readJson(PATHS.latest, {});
}

/** Ensure the public/data directory exists (for brief.json output). */
export function ensurePublicDataDir() {
  ensureDir(PUBLIC_DATA_DIR);
}
