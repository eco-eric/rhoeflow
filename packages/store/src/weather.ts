import type { Assessment } from "@rhoeflow/schema";
import { WEATHER_LIBRARY } from "@rhoeflow/calc";

export interface WeatherRef {
  library: string;
  version: string;
  station_key: string;
}

/**
 * The WeatherRef a run freezes: the pinned library and version (ADR-034) with the station the
 * assessment names. The engine refuses a station that is not pinned, so an address outside the
 * library is a structured error at run time, never a guess (WO-03 §7).
 */
export function weatherRefFor(assessment: Assessment): WeatherRef {
  const key = assessment.building.climate_and_risk_zones.weather_station.station_key.value;
  return { library: WEATHER_LIBRARY.name, version: WEATHER_LIBRARY.version, station_key: key ?? "" };
}
