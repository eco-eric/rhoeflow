# License and data inventory (LIC-001, LIC-002)

Every third-party component RhoeFlow runs, ships, or derives data from, with the exact release,
license, required notices, and how RhoeFlow uses it. Started in WO-02 Track A (2026-10-25).
Add a row before adding a dependency; update it when a pin changes.

## Reference engine and runtime (used in CI and reference mode, never shipped to customers)

| Component | Release | License (as read at the pinned version) | Required notices and restrictions | RhoeFlow use |
| --- | --- | --- | --- | --- |
| OpenStudio-HPXML | v1.12.0, tag commit `502811c…` | "OpenStudio® HPXML, Copyright (c) 2008-2026, Alliance for Energy Innovation, LLC, and other contributors." BSD-style, four conditions: (1) source redistributions keep the notice, conditions and disclaimer; (2) binary redistributions reproduce them in documentation or other materials; (3) no use of the copyright holder's or contributors' names to endorse or promote derived products without written permission; (4) modified or derivative distributions may not use the "OpenStudio" trademark, "OS", "os" or any confusingly similar designation without written permission from Alliance for Energy Innovation, LLC. "AS IS" disclaimer naming the US Government and DOE. | If RhoeFlow ever redistributes the engine (for example inside a self-hosted installer), reproduce the notice and conditions in the distribution's documentation. RhoeFlow's own name and branding never imply NREL, DOE or OpenStudio endorsement (LIC-002). RhoeFlow's TypeScript engine is a separate implementation that re-derives tables from ASHRAE and IECC; it is not a modified OpenStudio-HPXML and must not be described as one. | CI oracle and optional reference-mode worker (ADR-004, ADR-006). Not bundled with the app. |
| OpenStudio SDK and CLI | 3.11.0+241b8abb4d | "OpenStudio(R), Copyright (c) 2008-2026, Alliance for Energy Innovation, LLC." BSD-style, four conditions: as above for (1) and (2); (3) unmodified redistribution must call the software "OpenStudio(R)", and a modified version may not use that designation or any confusingly similar one and must refer to the underlying software as "OpenStudio(R)"; (4) no endorsement or promotion using the names of the copyright holder, contributors, the US Government or DOE. `copyright.txt` (1,030 lines) carries the third-party notices for the libraries OpenStudio itself bundles (EnergyPlus, Ruby, Python, Qt and others). | Same as above. Any redistribution must carry `copyright.txt` alongside `LICENSE.md`. | Runtime for the oracle only. |
| EnergyPlus | 25.2.0 (bundled in OpenStudio 3.11.0) | Covered by OpenStudio's `copyright.txt`; EnergyPlus itself is BSD-3 with a DOE/UC notice. | As bundled. Not invoked by design-only runs. | Not used in WO-02 (design-only path). |
| TMY3 weather files (DFW, Houston, and the other 25 shipped with OpenStudio-HPXML) | shipped with v1.12.0 | US DOE / NREL public data; redistributed by OpenStudio-HPXML under its license. The EPW header's design-condition block cites "Climate Design Data 2009 ASHRAE Handbook". | Record the source and file name on every run (WTH-001). The ASHRAE design values are quoted as carried in a public-domain weather file; the Handbook itself is not reproduced. | Design conditions (ADR-034). |

### Coefficients reused from OpenStudio-HPXML source (owner decision 2026-10-25)

`packages/calc/src/methods/coefficients.ts` transcribes numeric tables from
OpenStudio-HPXML v1.12.0 `hvac_sizing.rb`, `defaults.rb` and `constructions.rb` (CLTD bases,
color multipliers, wall-group thresholds, attic temperatures, slab model constants, glazing
peak solar factors, cooling load factors, shade-line multipliers, hourly temperature
adjustments, interior shading coefficients, infiltration coefficients and Table 5A defaults,
duct regain factors and effective-R and surface-area models). They are reused as BSD-licensed
source under conditions (1) and (2) of that license, with this notice:

> Portions derived from OpenStudio® HPXML, Copyright (c) 2008-2026, Alliance for Energy
> Innovation, LLC, and other contributors. All rights reserved. Used under the OpenStudio-HPXML
> license. RhoeFlow is not endorsed by, and is not a modified version of, OpenStudio® or
> OpenStudio-HPXML.

The same notice goes into any report or distribution that ships the engine (LIC-002). Each
table in `coefficients.ts` cites its source line range so the transcription can be checked.

## Standards and tables RhoeFlow derives from (no software)

| Source | Status | Rule |
| --- | --- | --- |
| ACCA Manual J 8th, Manual S 2023, Manual D 3rd | Copyrighted; not owned by the office as of 2026-10-25 (Manual J purchase recommended before phase 2) | Never copy tables or expression into the repo (CLAUDE.md). Methods are re-derived from ASHRAE Handbook Fundamentals, IECC and public physics; the method matrix cites the public source for every table. Reports disclose independent, non-ACCA-approved status (ADR-001, ADR-020). |
| ASHRAE Handbook Fundamentals | Copyrighted; equations and physical constants are facts, tables are expression | Cite chapter and edition in the method matrix; derive, do not transcribe tables. |
| IECC 2009 / 2015 / 2018 / 2021 prescriptive values, Texas SECO code history, DOE adoption status | Public code text and government data | Cited in template sources. |

## Application dependencies (shipped)

| Package | Version | License | Notes |
| --- | --- | --- | --- |
| next, react, react-dom | 16.4.3 / 19.3.1 | MIT | |
| zod | ^4.6.7 | MIT | |
| @supabase/supabase-js | ^2.118.0 | MIT | |
| typescript, vitest, @types/* | dev only | Apache-2.0 / MIT | not shipped |

Planned, not yet added (plan §Tech stack): react-konva (MIT), @xyflow/react (MIT), puppeteer
(Apache-2.0), @sparticuz/chromium-min (MIT), Capacitor (MIT). tldraw is excluded (ADR-008).
