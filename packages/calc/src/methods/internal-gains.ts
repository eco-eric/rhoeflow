/**
 * MJ8.internal_gains: appliance and occupant gains for the cooling load
 * (hvac_sizing.rb 1604 to 1621). Occupants add 230 Btu/h sensible and 200 Btu/h latent
 * each. The appliance base (2,400 sensible / 0 latent in the oracle's defaults) and the
 * occupant count (bedrooms + 1) are inputs; the caller records them as `defaulted`.
 */
import { INTERNAL_GAINS } from "./coefficients.js";
import { EngineInputError } from "./errors.js";

export const MJ8_INTERNAL_GAINS = { id: "MJ8.internal_gains", version: "0.1.0" } as const;

export interface InternalGainsInput {
  appliancesSensibleBtuh: number;
  appliancesLatentBtuh: number;
  occupants: number;
}

export interface InternalGains {
  coolingSensible: number;
  coolingLatent: number;
}

export function internalGains(input: InternalGainsInput): InternalGains {
  for (const [k, v] of Object.entries(input)) {
    if (!Number.isFinite(v) || v < 0) throw new EngineInputError("out_of_range", `${k} must be a non-negative finite number`, { method: MJ8_INTERNAL_GAINS.id, path: k });
  }
  return {
    coolingSensible: input.appliancesSensibleBtuh + INTERNAL_GAINS.sensiblePerOccupant * input.occupants,
    coolingLatent: input.appliancesLatentBtuh + INTERNAL_GAINS.latentPerOccupant * input.occupants,
  };
}

/** The oracle's default occupant count for sizing: bedrooms + 1 (defaults.rb). */
export function defaultOccupants(bedrooms: number): number {
  return bedrooms + 1;
}
