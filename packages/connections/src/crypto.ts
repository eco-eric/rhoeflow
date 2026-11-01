/**
 * Encryption of an account's WorkEdge key at rest (ADR-038 decision 4). AES-256-GCM through
 * WebCrypto, which the Cloudflare Worker and Node both provide. The account's team id is the
 * additional authenticated data, so a ciphertext copied onto another account's row fails to open.
 *
 * The master key is the Worker secret `RHOE_CONNECTION_KEY`: 32 random bytes, base64. Make one with
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

export const CURRENT_KEY_VERSION = 1;
const AAD_PREFIX = "rhoe.workedge_connection.v1:";

export interface Sealed {
  ciphertext: string; // base64
  iv: string; // base64, 12 bytes
  key_version: number;
}

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class MasterKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MasterKeyError";
  }
}

async function importMaster(master_b64: string | undefined): Promise<CryptoKey> {
  if (!master_b64) throw new MasterKeyError("RHOE_CONNECTION_KEY is not set");
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = b64decode(master_b64.trim());
  } catch {
    throw new MasterKeyError("RHOE_CONNECTION_KEY is not valid base64");
  }
  if (raw.length !== 32) throw new MasterKeyError("RHOE_CONNECTION_KEY must be 32 bytes (base64 of 32 random bytes)");
  return globalThis.crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function aad(account_id: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(AAD_PREFIX + account_id);
}

export async function seal(master_b64: string | undefined, account_id: string, plaintext: string): Promise<Sealed> {
  const key = await importMaster(master_b64);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(account_id) }, key, new TextEncoder().encode(plaintext));
  return { ciphertext: b64encode(new Uint8Array(ct)), iv: b64encode(iv), key_version: CURRENT_KEY_VERSION };
}

/** Throws when the master key is wrong, the row was tampered with, or it belongs to another team. */
export async function open(master_b64: string | undefined, account_id: string, sealed: Sealed): Promise<string> {
  if (sealed.key_version !== CURRENT_KEY_VERSION) throw new MasterKeyError(`stored key version ${sealed.key_version} is not the current ${CURRENT_KEY_VERSION}`);
  const key = await importMaster(master_b64);
  const pt = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: b64decode(sealed.iv), additionalData: aad(account_id) }, key, b64decode(sealed.ciphertext));
  return new TextDecoder().decode(pt);
}
