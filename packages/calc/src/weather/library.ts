/**
 * Pinned weather library (ADR-034). Each station record is the ASHRAE design-condition block of
 * the TMY3 EPW header shipped with OpenStudio-HPXML v1.12.0, converted to IP units the way the
 * oracle converts it (weather.rb 284 to 327). Plain data so the engine core stays free of Node
 * and filesystem access; `test/weather/library.test.ts` re-parses the committed EPW header and
 * asserts every value here.
 *
 * A run records `{ library, version, station_key }` in its WeatherRef. A station that is not in
 * this file is an `unsupported` input, never a guess.
 */
import { EngineInputError } from "../methods/errors.js";

export const WEATHER_LIBRARY = { name: "openstudio-hpxml-weather", version: "v1.12.0" } as const;

export interface WeatherStation {
  stationKey: string;
  epwFile: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  /** Elevation in ft, rounded to 0.1 like the oracle (171 m → 561.0 ft). */
  elevationFt: number;
  designConditionsTitle: string;
  heatingDb99F: number;
  coolingDb1F: number;
  coolingMcwb1F: number;
  dailyRangeF: number;
  /**
   * Values the oracle derives from the EPW's hourly data rather than its header, pinned here
   * because the engine carries no hourly weather. Produced by OpenStudio-HPXML v1.12.0
   * `WeatherFile` (tools/hpxml-oracle/station-data.rb); used by MJ8.buffer_space only.
   */
  hourlyDerived: {
    /** Weather shielding factor (weather.data.WSF). */
    wsf: number;
    /** Annual average dry bulb, °F (weather.data.AnnualAvgDrybulb). */
    annualAvgDrybulbF: number;
  };
}

const STATIONS: Readonly<Record<string, WeatherStation>> = {
  "722590": {
    stationKey: "722590",
    epwFile: "USA_TX_Dallas-Fort.Worth.Intl.AP.722590_TMY3.epw",
    name: "Dallas Fort Worth Intl Ap",
    state: "TX",
    latitude: 32.9,
    longitude: -97.02,
    elevationFt: 561.0,
    designConditionsTitle: "Climate Design Data 2009 ASHRAE Handbook",
    heatingDb99F: 25.88,
    coolingDb1F: 98.42,
    coolingMcwb1F: 74.66,
    dailyRangeF: 19.8,
    hourlyDerived: { wsf: 0.53, annualAvgDrybulbF: 65.72119178082193 },
  },
};

export function listWeatherStations(): readonly WeatherStation[] {
  return Object.values(STATIONS);
}

/** Resolve a run's WeatherRef against the pinned library; refuses anything not pinned. */
export function resolveWeatherStation(ref: { library: string; version: string; station_key: string }): WeatherStation {
  if (ref.library !== WEATHER_LIBRARY.name || ref.version !== WEATHER_LIBRARY.version) {
    throw new EngineInputError(
      "unsupported",
      `weather library ${ref.library}@${ref.version} is not pinned; this engine carries ${WEATHER_LIBRARY.name}@${WEATHER_LIBRARY.version}`,
      { path: "weather", method: "MJ8.design_conditions" },
    );
  }
  const station = STATIONS[ref.station_key];
  if (!station) {
    throw new EngineInputError("unsupported", `station ${ref.station_key} is not in ${WEATHER_LIBRARY.name}@${WEATHER_LIBRARY.version}`, {
      path: "weather.station_key",
      method: "MJ8.design_conditions",
    });
  }
  return station;
}
