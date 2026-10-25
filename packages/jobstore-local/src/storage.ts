import { JobStoreError } from "@rhoeflow/jobstore";

/**
 * The slice of object storage `LocalJobStore` needs. Kept tiny so the Supabase client is
 * replaceable by an in-memory store in tests and by nothing else in production.
 */
export interface MediaStorage {
  /** Store bytes at `path`. Must fail with `conflict` if the path already exists. */
  put(path: string, bytes: Uint8Array, content_type: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  get(path: string): Promise<{ bytes: Uint8Array; content_type: string } | null>;
}

/** Test double. Never used outside tests. */
export class MemoryMediaStorage implements MediaStorage {
  readonly objects = new Map<string, { bytes: Uint8Array; content_type: string }>();

  async put(path: string, bytes: Uint8Array, content_type: string): Promise<void> {
    if (this.objects.has(path)) {
      throw new JobStoreError("conflict", `object already exists at ${path}`);
    }
    this.objects.set(path, { bytes: new Uint8Array(bytes), content_type });
  }

  async exists(path: string): Promise<boolean> {
    return this.objects.has(path);
  }

  async get(path: string) {
    return this.objects.get(path) ?? null;
  }
}

/**
 * The minimal Supabase Storage surface we call, typed structurally so tests can pass a
 * fake and so this package does not re-export Supabase's types.
 */
export interface SupabaseStorageBucketLike {
  upload(
    path: string,
    body: Uint8Array,
    options: { contentType: string; upsert: boolean },
  ): Promise<{ data: { path: string } | null; error: { message: string; statusCode?: unknown } | null }>;
  download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
}

export interface SupabaseStorageLike {
  from(bucket: string): SupabaseStorageBucketLike;
}

/**
 * Supabase Storage adapter. The bucket is the app's own (ADR-028 allows media here only
 * as the ADR-031 interim). Uploads never upsert: a path collision is a bug, not a retry.
 */
export class SupabaseMediaStorage implements MediaStorage {
  readonly #storage: SupabaseStorageLike;
  readonly #bucket: string;

  constructor(storage: SupabaseStorageLike, bucket: string) {
    if (!bucket) throw new Error("SupabaseMediaStorage requires a bucket name");
    this.#storage = storage;
    this.#bucket = bucket;
  }

  async put(path: string, bytes: Uint8Array, content_type: string): Promise<void> {
    const { error } = await this.#storage.from(this.#bucket).upload(path, bytes, { contentType: content_type, upsert: false });
    if (error) {
      const code = String(error.statusCode ?? "");
      if (code === "409" || /already exists|Duplicate/i.test(error.message)) {
        throw new JobStoreError("conflict", `object already exists at ${path}`, { cause: error });
      }
      if (code === "401" || code === "403") {
        throw new JobStoreError("unauthorized", `storage rejected upload to ${path}: ${error.message}`, { cause: error });
      }
      if (code === "429") {
        throw new JobStoreError("rate_limited", `storage rate limited: ${error.message}`, { cause: error });
      }
      throw new JobStoreError("unavailable", `storage upload failed for ${path}: ${error.message}`, { cause: error });
    }
  }

  async exists(path: string): Promise<boolean> {
    return (await this.get(path)) !== null;
  }

  async get(path: string) {
    const { data, error } = await this.#storage.from(this.#bucket).download(path);
    if (error || !data) return null;
    return { bytes: new Uint8Array(await data.arrayBuffer()), content_type: data.type };
  }
}
