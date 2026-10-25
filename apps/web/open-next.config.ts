import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default OpenNext config: no incremental cache binding yet (no ISR in WO scope). ADR-036.
export default defineCloudflareConfig();
