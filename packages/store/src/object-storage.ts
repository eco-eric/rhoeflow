import { StoreError } from "./errors.js";

/**
 * The slice of object storage the run service needs for artifact bundles (C3). Same shape as
 * `MediaStorage` in jobstore-local, kept separate so this package does not depend on the
 * interim media store. `put` never overwrites: a frozen run's files are written once.
 */
export interface ObjectStorage {
  readonly bucket: string;
  put(path: string, bytes: Uint8Array, content_type: string): Promise<void>;
  get(path: string): Promise<{ bytes: Uint8Array; content_type: string } | null>;
  exists(path: string): Promise<boolean>;
}

/** Test double. */
export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { bytes: Uint8Array; content_type: string }>();
  constructor(readonly bucket = "rhoe-runs") {}

  async put(path: string, bytes: Uint8Array, content_type: string): Promise<void> {
    if (this.objects.has(path)) throw new StoreError("conflict", `object already exists at ${path}`);
    this.objects.set(path, { bytes: new Uint8Array(bytes), content_type });
  }
  async get(path: string) {
    return this.objects.get(path) ?? null;
  }
  async exists(path: string) {
    return this.objects.has(path);
  }
}
