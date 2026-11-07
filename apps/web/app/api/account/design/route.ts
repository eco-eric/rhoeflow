import { z } from "zod";
import { getDesignDefaults, saveDesignDefaults } from "@rhoeflow/store";
import { listWeatherStations } from "@rhoeflow/calc";
import { STANDARD_SETPOINTS } from "@rhoeflow/templates";
import { requireContext } from "../../../../lib/context";
import { handler, json, parseBody } from "../../../../lib/http";

/**
 * This account's design conditions (ADR-047).
 * GET: the account's defaults, the standard values they replace (Manual J set points and each
 * weather station's ASHRAE dry bulbs), and whether the caller may change them.
 * PUT { heating_setpoint_f?, cooling_setpoint_f?, stations: { [station_key]: { heating_design_temp_f?, cooling_design_temp_f? } } }:
 * admins only; replaces the whole document. A value left out goes back to the standard value.
 */
function standards() {
  return {
    setpoints: STANDARD_SETPOINTS,
    stations: listWeatherStations().map((s) => ({ station_key: s.stationKey, name: s.name, state: s.state, heating_design_temp_f: s.heatingDb99F, cooling_design_temp_f: s.coolingDb1F, title: s.designConditionsTitle })),
  };
}

export const GET = handler(async () => {
  const rc = await requireContext();
  return json({ ...(await getDesignDefaults(rc.deps, rc.ctx)), standard: standards() });
});

export const PUT = handler(async (req: Request) => {
  const rc = await requireContext();
  const body = await parseBody(req, z.unknown());
  return json({ ...(await saveDesignDefaults(rc.deps, rc.ctx, body)), standard: standards() });
});
