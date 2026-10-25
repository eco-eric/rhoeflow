import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEpwHeader } from "../../src/methods/design-conditions.js";
import { WEATHER_LIBRARY, listWeatherStations, resolveWeatherStation } from "../../src/weather/library.js";

describe("pinned weather library (ADR-034)", () => {
  it("every station matches its committed EPW header", () => {
    for (const s of listWeatherStations()) {
      const text = readFileSync(resolve(import.meta.dirname, `../../fixtures/weather/${s.epwFile.replace(/\.epw$/, ".header.txt")}`), "utf8");
      const h = parseEpwHeader(text);
      expect(h.wmo).toBe(s.stationKey);
      expect(h.latitude).toBe(s.latitude);
      expect(h.longitude).toBe(s.longitude);
      expect(Math.round(h.elevationFt * 10) / 10).toBe(s.elevationFt);
      expect(h.designConditionsTitle).toBe(s.designConditionsTitle);
      expect(Math.round(h.heatingDb99F * 100) / 100).toBe(s.heatingDb99F);
      expect(Math.round(h.coolingDb1F * 100) / 100).toBe(s.coolingDb1F);
      expect(Math.round(h.coolingMcwb1F * 100) / 100).toBe(s.coolingMcwb1F);
      expect(Math.round(h.dailyRangeF * 100) / 100).toBe(s.dailyRangeF);
    }
  });

  it("matches the pin file's weather_library block", () => {
    const pin = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../tools/hpxml-oracle/pin.json"), "utf8")) as {
      weather_library: { name: string; version: string; stations: Record<string, { heating_99pct_drybulb_F: number; cooling_1pct_drybulb_F: number }> };
    };
    expect(pin.weather_library.name).toBe(WEATHER_LIBRARY.name);
    expect(pin.weather_library.version).toBe(WEATHER_LIBRARY.version);
    const dfw = resolveWeatherStation({ library: WEATHER_LIBRARY.name, version: WEATHER_LIBRARY.version, station_key: "722590" });
    expect(pin.weather_library.stations["722590"]!.heating_99pct_drybulb_F).toBe(dfw.heatingDb99F);
    expect(pin.weather_library.stations["722590"]!.cooling_1pct_drybulb_F).toBe(dfw.coolingDb1F);
  });

  it("refuses an unpinned library or station", () => {
    expect(() => resolveWeatherStation({ library: "fixture-weather", version: "0", station_key: "722590" })).toThrow(/not pinned/);
    expect(() => resolveWeatherStation({ library: WEATHER_LIBRARY.name, version: WEATHER_LIBRARY.version, station_key: "999999" })).toThrow(/not in/);
  });
});
