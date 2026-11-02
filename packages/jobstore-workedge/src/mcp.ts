import { JobStoreError } from "@rhoeflow/jobstore";

/**
 * Minimal client for WorkEdge's MCP server: stateless JSON-RPC over HTTP POST, JSON replies, no
 * session (docs/api/MCP.md in field-doc-suite). `tools/call` and `tools/list` are used; the server
 * accepts them without an `initialize` handshake. The key goes in the Authorization header and nowhere else:
 * it is never put in a URL, an error message or a log line (ADR-038).
 */
export interface McpClientConfig {
  /** WorkEdge MCP address, e.g. https://<project-ref>.supabase.co/functions/v1/mcp. */
  mcp_url: string;
  /** The calling account's own WorkEdge key (ADR-038). */
  api_key: string;
  fetch?: typeof fetch;
  /** Milliseconds before a call is abandoned as unavailable. */
  timeout_ms?: number;
}

export const MCP_PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_TIMEOUT_MS = 15_000;

interface RpcReply {
  result?: { structuredContent?: unknown; content?: { type: string; text?: string }[]; isError?: boolean; tools?: McpToolInfo[] };
  error?: { code: number; message: string };
}

/** One tool as `tools/list` describes it: its name and the arguments it takes. */
export interface McpToolInfo {
  name: string;
  inputSchema?: { properties?: Record<string, { type?: string | string[]; enum?: unknown[] }> };
}

let nextId = 1;

export class McpClient {
  readonly #config: McpClientConfig;

  constructor(config: McpClientConfig) {
    if (!/^https:\/\//.test(config.mcp_url)) throw new Error("McpClient: mcp_url must be an https address");
    if (!config.api_key) throw new Error("McpClient: api_key is required");
    this.#config = config;
  }

  /**
   * GET from one of WorkEdge's REST functions that sit beside the MCP server on the same project
   * and take the same key in `x-api-key` (e.g. `api-properties`). The address is the MCP address
   * with its last segment swapped, so one `WORKEDGE_MCP_URL` still names everything.
   */
  async restGet<T>(fn: string, path: string): Promise<T> {
    const call = `rest: ${fn}`;
    if (!/\/mcp\/?$/.test(this.#config.mcp_url)) throw new JobStoreError("not_implemented", `WorkEdge REST address unknown for ${fn}`, { call });
    const url = this.#config.mcp_url.replace(/\/mcp\/?$/, `/${fn}`) + path;
    const doFetch = this.#config.fetch ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#config.timeout_ms ?? DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await doFetch(url, { method: "GET", headers: { "x-api-key": this.#config.api_key, accept: "application/json" }, signal: controller.signal });
    } catch (cause) {
      throw new JobStoreError("unavailable", `WorkEdge could not be reached (${fn})`, { call, cause });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) throw new JobStoreError("unauthorized", "WorkEdge refused this account's key; reconnect WorkEdge with a current key", { call });
    if (res.status === 403) throw new JobStoreError("forbidden", `WorkEdge refused the request (${fn})`, { call });
    if (res.status === 404) throw new JobStoreError("not_found", `WorkEdge has no such record (${fn})`, { call });
    if (res.status === 429) throw new JobStoreError("rate_limited", "WorkEdge's hourly request limit for this key is used up; try again later", { call });
    if (!res.ok) throw new JobStoreError("unavailable", `WorkEdge answered HTTP ${res.status} (${fn})`, { call });
    try {
      return (await res.json()) as T;
    } catch (cause) {
      throw new JobStoreError("unavailable", `WorkEdge sent a reply that is not JSON (${fn})`, { call, cause });
    }
  }

  async #rpc(method: string, params: Record<string, unknown>, label: string): Promise<{ reply: RpcReply; call: string }> {
    const call = `mcp: ${label}`;
    const doFetch = this.#config.fetch ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#config.timeout_ms ?? DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await doFetch(this.#config.mcp_url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#config.api_key}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": MCP_PROTOCOL_VERSION,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
        signal: controller.signal,
      });
    } catch (cause) {
      throw new JobStoreError("unavailable", `WorkEdge could not be reached (${label})`, { call, cause });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) throw new JobStoreError("unauthorized", "WorkEdge refused this account's key; reconnect WorkEdge with a current key", { call });
    if (res.status === 403) throw new JobStoreError("forbidden", "WorkEdge refused the request", { call });
    if (res.status === 429) throw new JobStoreError("rate_limited", "WorkEdge's hourly request limit for this key is used up; try again later", { call });
    if (!res.ok) throw new JobStoreError("unavailable", `WorkEdge answered HTTP ${res.status} (${label})`, { call });

    let reply: RpcReply;
    try {
      reply = (await res.json()) as RpcReply;
    } catch (cause) {
      throw new JobStoreError("unavailable", `WorkEdge sent a reply that is not JSON (${label})`, { call, cause });
    }
    return { reply, call };
  }

  /** The server's tools and the arguments each takes. */
  async listTools(): Promise<McpToolInfo[]> {
    const { reply, call } = await this.#rpc("tools/list", {}, "tools/list");
    if (reply.error) throw new JobStoreError("unavailable", `WorkEdge: ${reply.error.message}`, { call });
    return reply.result?.tools ?? [];
  }

  /** Calls one tool and returns its structured result. Throws JobStoreError with a code callers branch on. */
  async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { reply, call } = await this.#rpc("tools/call", { name, arguments: args }, name);
    if (reply.error) {
      throw new JobStoreError(reply.error.code === -32602 ? "invalid_request" : "unavailable", `WorkEdge: ${reply.error.message}`, { call });
    }
    const result = reply.result;
    if (!result) throw new JobStoreError("unavailable", `WorkEdge sent no result (${name})`, { call });
    if (result.isError) {
      const text = result.content?.find((c) => c.type === "text")?.text ?? "tool error";
      throw new JobStoreError(/not found/i.test(text) ? "not_found" : "invalid_request", `WorkEdge: ${text}`, { call });
    }
    if (result.structuredContent !== undefined) return result.structuredContent as T;
    const text = result.content?.find((c) => c.type === "text")?.text;
    if (text === undefined) throw new JobStoreError("unavailable", `WorkEdge sent an empty result (${name})`, { call });
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new JobStoreError("unavailable", `WorkEdge sent a result that is not JSON (${name})`, { call, cause });
    }
  }
}
