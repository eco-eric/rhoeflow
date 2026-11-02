import { describe, expect, it, vi } from "vitest";
import { lookupAddress, orsUrl, parseOrsFeatures } from "../lib/address";

describe("address lookup (ADR-041)", () => {
  it("asks for US street addresses only, five at most", () => {
    const u = new URL(orsUrl("123 Main", { lat: 32.7767, lon: -96.797 }));
    expect(u.origin + u.pathname).toBe("https://api.openrouteservice.org/geocode/autocomplete");
    expect(u.searchParams.get("boundary.country")).toBe("US");
    expect(u.searchParams.get("layers")).toBe("address");
    expect(u.searchParams.get("size")).toBe("5");
    expect(u.searchParams.get("focus.point.lat")).toBe("32.777");
    expect(u.searchParams.has("api_key")).toBe(false);
  });

  it("turns features into address fields and drops duplicates and rows with no street", () => {
    const items = parseOrsFeatures([
      { properties: { housenumber: "123", street: "Main St", locality: "Dallas", region_a: "TX", postalcode: "75201" } },
      { properties: { housenumber: "123", street: "Main St", locality: "Dallas", region_a: "TX", postalcode: "75201" } },
      { properties: { name: "45 Elm Ave", localadmin: "Plano", region: "Texas" } },
      { properties: { locality: "Frisco" } },
    ]);
    expect(items).toEqual([
      { label: "123 Main St, Dallas, TX 75201", line1: "123 Main St", city: "Dallas", state: "TX", postal_code: "75201" },
      { label: "45 Elm Ave, Plano, Texas", line1: "45 Elm Ave", city: "Plano", state: "Texas", postal_code: null },
    ]);
  });

  it("is off with no key, quiet on short text, and sends the key in a header", async () => {
    expect(await lookupAddress("123 Main", { apiKey: undefined })).toEqual({ enabled: false });
    const f = vi.fn<typeof fetch>(async () => Response.json({ features: [{ properties: { housenumber: "9", street: "Oak St", locality: "Allen", region_a: "TX" } }] }));
    expect(await lookupAddress("12", { apiKey: "k", fetch: f })).toEqual({ enabled: true, items: [] });
    expect(f).not.toHaveBeenCalled();
    const r = await lookupAddress("9 Oak", { apiKey: "secret-k", fetch: f });
    expect(r).toMatchObject({ enabled: true, items: [{ line1: "9 Oak St", city: "Allen" }] });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).not.toContain("secret-k");
    expect(new Headers(init?.headers).get("authorization")).toBe("secret-k");
  });

  it("falls back to typing when the service refuses or is busy", async () => {
    const busy = vi.fn<typeof fetch>(async () => new Response("", { status: 429 }));
    expect(await lookupAddress("9 Oak St", { apiKey: "k", fetch: busy })).toMatchObject({ enabled: true, items: [], error: expect.stringContaining("type the address") });
    const down = vi.fn<typeof fetch>(async () => {
      throw new Error("network");
    });
    expect(await lookupAddress("9 Oak St", { apiKey: "k", fetch: down })).toMatchObject({ items: [], error: expect.any(String) });
  });
});
