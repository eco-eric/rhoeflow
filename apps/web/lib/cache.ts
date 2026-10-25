"use client";
import type { QuickPassAnswers } from "@rhoeflow/templates";

/**
 * The open job cached on the phone (D8; ADR-017: IndexedDB cache of the open job only, no
 * sync engine). Every change is written here first, then saved to the server, so a dropped
 * signal or a closed tab loses no answers (usability task 5). `dirty` means the server has not
 * confirmed the answers yet; `base_draft_version` is the server version they were edited on.
 */
export interface CachedJob {
  assessment_id: string;
  answers: QuickPassAnswers;
  template_id: string | null;
  base_draft_version: number;
  dirty: boolean;
  /** Idempotency key of a run request that has not come back yet; a retry resends it (API-002). */
  pending_run_key: string | null;
  updated_at: string;
}

const DB = "rhoeflow";
const STORE = "open-jobs";

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "assessment_id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function readCached(assessment_id: string): Promise<CachedJob | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(assessment_id);
    req.onsuccess = () => resolve((req.result as CachedJob | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function writeCached(job: CachedJob): Promise<boolean> {
  const db = await open();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(job);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}
