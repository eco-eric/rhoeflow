# RhoeFlow (Load Calc & Duct Design App) — Research & Plan

Oct 24, 2026 · Eric Love · v2 · Editable doc: https://claude.ai/artifact/87MxJH2zapFXcCD8XLzAqp

## Executive summary

Build it: a web-first Next.js app on Vercel and Supabase with a TypeScript calculation engine, a 12-question block-load intake with DFW defaults by build year, Manual S selection against a curated Mitsubishi equipment library, and a react-konva duct-drawing canvas, phased over about six months with the engine proven first. The research supports your premise with one correction: the physics and procedures are public, the specific ACCA tables are not, and the clean path is to re-derive them from ASHRAE, IECC and NOAA and to use NREL's open-source OpenStudio-HPXML (which implements Manual J and S under a BSD license) as the reference and test oracle.

This is version 2 of the plan: it merges the Perplexity v3 brief's governance, domain model, provenance rules and duct sizing-vs-prediction distinction into the original research, and keeps the original's engine choice (TypeScript product engine, HPXML as oracle), stack, verified numbers and sequence. The full comparison is the next section.

The six findings that shape the plan:

1. **No permit office requires ACCA-approved software.** The code says "in accordance with Manual J/S/D or other approved methods"; DFW cities (via NCTCOG amendments) hand Manual J to third-party energy providers and do not review it. An internal tool needs no recognition; format reports to ACCA's review-form fields so reviewers recognize them.
2. **There is a real gap in the market.** Nothing offers J+S+D with blueprint tracing and phone capture in one web app under about $100/month. CoolCalc ($50/mo) is closest; Wrightsoft ($900/yr, Windows-only) is the standard everyone calls complex; the LiDAR apps (Conduit, Amply) skip Manual S and D entirely.
3. **Attic ducts and glazing dominate a DFW load**, so the quick pass asks about those first and defaults the rest from the home's era. Sanity-check every result against the home template's band (see Manual J section), not a national average.
4. **Manual S for inverter equipment has specific rules** (0.90–1.30 cooling band, latent ≥ load, heating ≥ 1.00× at 27°F, minimum capacity ≤ 0.80× heat loss, zone minimums on multi-zone) and needs OEM expanded data interpolated at design conditions. Mitsubishi publishes it only as PDFs, so the equipment library is a one-time extraction job for the pairings you sell.
5. **AI reads text and counts things; it cannot do geometry.** Vision models read dimension strings, room names and window counts well and are near-random on floor-plan geometry, so AI output is always a draft the user confirms.
6. **The duct drawing is a graph.** Symbols are nodes, runs are edges carrying length and fitting type; that is what lets the app auto-size, print a schedule and a bill of materials. Desktop is the design surface; the phone gets photos, the quick pass and a schematic view.

Total spend outside your time is small: the three ACCA manuals, optionally a CoolCalc seat for spot validation, and Claude API usage for the vision pass.

## Comparison with the Perplexity v3 brief

The two plans agree on the foundations and disagree on two things: where the calculation runs, and how much process surrounds the work. The Perplexity package (Master Brief v3, 97-item requirements register, decision log, AI handoff, Oct 24, 2026) contains no code; it is a specification and governance framework. This plan contains the concrete research the brief defers to work orders R01–R10. The best approach takes the brief's governance and provenance model and keeps this plan's engine choice, stack, numbers and sequence.

### Where they agree

- OpenStudio-HPXML is the open reference for Manual J/S; Konva for the canvas; pdf.js for blueprints; the duct drawing stored as an engineering graph independent of the renderer.
- AI proposes, people accept, deterministic versioned code calculates. Manual entry must work without AI.
- Block load first, room-by-room later; the useful block release must not wait on everything else.
- Every calculation run is frozen with its inputs and engine version; reports render from frozen runs, never from the live editor.
- No ACCA approval roadmap, no paid calculation engine, no hard-coded DFW in the engine.

### Where they differ

| Topic | Perplexity brief | This plan | Resolution |
| --- | --- | --- | --- |
| Calculation engine | Wrap a pinned OpenStudio-HPXML release as an isolated worker (Ruby/OpenStudio 3.11 runtime); custom engine only if feasibility fails (R01, ADR-004) | Port Manual J/S to a TypeScript package; use HPXML only as the test oracle | **Hybrid.** TypeScript is the product engine: it runs in the browser and offline, returns in milliseconds, and is fully inspectable. HPXML is the differential oracle in CI and an optional "reference mode" worker. A one-week R01 spike runs HPXML design-only first so the port has a target. |
| Hosting | Self-hosted or local reproducible path required; avoid mandatory vendor accounts and external CDNs | Vercel + Supabase (Eric's existing stack) | **Keep Vercel + Supabase.** The brief's boundary is against paid *calculation* dependencies and it explicitly allows owner-approved hosting cost. Supabase is self-hostable and the engine is a plain package with a CLI, so the local path exists without building for it first. Bundle fonts and libraries rather than loading from a CDN. |
| Timeline and tolerances | No durations, no accuracy percentages, no "within a few percent" rule until measured | Six-month phases; engine gate at about 3% vs. oracle | **Keep the phases as estimates, label them so.** Replace the single 3% gate with per-output tolerances set after the R01 spike (floating point, interpolation, method difference and input uncertainty tracked separately). |
| Governance | Requirement IDs, ADR log, method matrix with stable method IDs, release gates G0–G9, work orders, completion evidence rules | Five phases with one gate each; open-decisions checklist | **Adopt the brief's apparatus**, trimmed to what one builder plus Claude Code will actually maintain: the requirements CSV as the backlog, an ADR log, a method matrix, and gates mapped onto the phases. |
| Domain model | Property → Project → Assessment → evidence, model revisions, scenarios, runs, equipment candidates, duct revisions, report revisions, share collections; rooms ≠ thermal zones ≠ systems | Job-centric; rooms with zone assignment | **Adopt the brief's hierarchy.** It is what makes multi-system homes, scenarios and frozen reports work, and it maps onto a Trade OS property/job later. |
| Provenance | Seven categories per input (measured, documented, assumed, AI-proposed, derived, defaulted, unknown); no invented confidence percentages; unknown ≠ zero | "Measured vs. assumed" override log; AI output with confidence flags | **Adopt the seven categories** and replace "confidence flags" with evidence status plus the model's stated uncertainty. Era defaults stay, tagged *defaulted* with their source, and the report shows them. |
| Duct engineering | Sizing mode (sizes for assigned CFM) separate from prediction mode (solve actual flow against the fan curve); ports with explicit connections, touching symbols don't connect; route length includes rises and drops; fitting-data licensing is a research gate (R06) | Friction-rate worksheet, auto-size, velocity checks, in-house EL table from ASHRAE/SMACNA | **Adopt ports, the two modes, and vertical routing.** Ship sizing mode in phase 5; prediction mode is a later optional phase. The in-house equivalent-length table built from ASHRAE loss coefficients satisfies R06. |
| Equipment | Manual reviewed performance entry is an acceptable first release; no universal oversize % hard-coded; gross/net and fan-heat conventions explicit; multi-split outdoor minimum never inferred from indoor sums | Curated Mitsubishi JSON library with Manual S 2023 limits (0.90–1.30 etc.) | **Compatible.** The limits are encoded as a method with an ID and edition (Manual S 2023, Addenda A/B), not a universal constant; manual entry of a performance table is the fallback for any pairing not in the library. |
| Airflow | Six distinct airflow values tracked (heating need, cooling sensible need, selected target, equipment-required, assigned terminal, predicted, measured) | Room design CFM | **Adopt the distinct values**; the schema carries them even if the first UI shows two. |
| Offline and sync | Conflict-preserving sync for engineering values; never last-write-wins; browser storage caveats | PowerSync later (last-write-wins default) | **Keep PowerSync but configure conflict preservation** for accepted engineering inputs; drafts and photos can be last-write-wins. |
| Reports | Original branding, independent-software notice, customer package plus technical package, portable JSON/CSV backup | Customer summary plus technical pages | **Adopt the notice wording and the portable export.** |
| Permits and market | Not researched (deferred) | Researched: code requires "in accordance with" not approved software; DFW defers Manual J to third parties; competitor table | Keep this plan's findings; they close the brief's open question about acceptance. |

### What the brief adds that this plan lacked

- The Property → Project → Assessment model and the rule that a room, a thermal zone and an HVAC system are different things.
- The provenance vocabulary and the ban on invented confidence numbers.
- Sizing mode vs. prediction mode for ducts, and port-based connectivity.
- Frozen artifact bundles per run (accepted snapshot, normalized engine input, raw results, interpreted results, manifest) and dependency fingerprints so a changed input invalidates exactly the results it affects.
- Untrusted-document handling: embedded instructions in an uploaded PDF cannot drive tools or data access.
- Repository discipline: ADRs, method IDs independent of app version, honest completion evidence from AI contributors.

### What this plan has that the brief defers

- Verified numbers: DFW design conditions, Manual S 2023 limits, Manual D component losses and equivalent lengths, IECC era values.
- The permit reality in DFW and the ACCA-approval question answered with code text.
- Stack decisions with evidence (tldraw's license, ElectricSQL's shutdown, Puppeteer on Vercel, Supabase Edge limits).
- The competitor landscape and the 12-question quick pass.

### Where the brief overreaches for a one-person build

The brief is written for a team with reviewers; some of it would stall a solo founder. Keep the 97 requirements as a backlog but do not treat every one as a release blocker; the gates below mark which ones block which phase. Skip the cross-AI adversarial review ritual as a standing process and use it once, at the end of the R01 spike. Do not build the "throwaway drawing feasibility experiment" separately; phase 5's first week is that experiment.

## What's public, what's ACCA's, and what permits require

Implementing the math is lawful; copying Manual J, S or D tables verbatim into a product is the risk. The physics is ASHRAE's and first-principles, the defaults are published in code, and NREL has an open BSD-licensed implementation of Manual J and S that serves as both reference and test oracle. The code never mandates ACCA-approved software, and DFW cities mostly hand Manual J off to third-party energy providers rather than reviewing it themselves.

### Public and safe to implement

- Heat transfer: Q = U × A × ΔT; infiltration sensible = 1.1 × CFM × ΔT, latent = 0.68 × CFM × Δgrains; CFM = ACH × volume / 60. These are psychrometric constants, not ACCA's.
- Solar gain through glass: peak solar factor × cooling load factor × SHGC, from the ASHRAE Handbook of Fundamentals residential load chapter; SHGC = 0.87 × shading coefficient ([Thornton, CO design criteria](https://www.thorntonco.gov/media/file/design-parameters-manual-jupdated-2012-codepdf)).
- Infiltration from a blower door: the Sherman-Grimsrud / LBL stack-and-wind model, published by ASHRAE ([LBL model](https://www.builditsolar.com/Projects/Conservation/BlowerDoor/LBLInfilModel.htm), [n-factor](https://building-performance.org/bpa-journal/ach50-achnat/)).
- Internal gains: bedrooms + 1 occupants at 230 sensible / 200 latent Btuh, 1,200 (or 2,400) Btuh appliances, published in ICC's own [CodeNotes](https://www.iccsafe.org/wp-content/uploads/17-14144_PMG_CodeNotes_Manual_J_FINAL_HIRES_noCrops.pdf).
- Assembly U-values computed from layer R-values (ASHRAE material tables, IECC prescriptive tables) rather than copying Manual J Table 4A.
- Window and door defaults from 2021 IECC Table R303.1.3: metal single 1.20 / double 0.80, thermal-break 1.10 / 0.65, nonmetal 0.95 / 0.55; SHGC single clear 0.8, double clear 0.7 ([IECC Ch. 3 text](https://seattle.gov/documents/Departments/SDCI/Codes/SeattleEnergyCode/2021SECResChapter3.pdf)).
- Outdoor design conditions from NOAA/NCEI's free engineering weather data rather than ACCA Table 1A ([KDFW](https://www.ncei.noaa.gov/pub/access/cebrequests/engineeringwx/ICAO_KDFW_EWD_IP.pdf)); Fort Worth's own IRC amendment lists 25°F winter / 99°F summer ([ordinance](https://www.fortworthtexas.gov/files/assets/public/development-services/documents/building-code-local-amendments/2021-approved-local-amendments/irc-amendments-2021-ordinance-25383-03-2022.pdf)). Grains difference computed psychrometrically.
- Manual D math: friction rate = ASP × 100 / TEL, Darcy-Weisbach with Colebrook or Haaland friction factor, roughness 0.0003 ft galvanized / 0.003 ft flex, ASHRAE's flex compression correction, and the Huebscher round-to-rectangular equivalence ([HVAC School](https://hvacrschool.com/determine-friction-rate-residential-duct-design/), [duct friction formulas](https://aircondlounge.com/duct-friction-loss-formula-how-to-calculate-friction-loss-in-ducts)).

### ACCA's copyrighted expression (re-derive, don't copy)

The specific tabulations: Table 1A as arranged, the HTM tables (2, 3, 4), Table 4A construction numbers and group letters, Table 5A default ACH by tightness, Table 7 duct factors, the A11/A12 CLF and CLTD figures, the AED excursion procedure text, the worksheets, Manual D Appendix 3 equivalent-length groups, and the trademarks Manual J®, S®, D®. Facts and formulas are not copyrightable but a table's selection and arrangement can be; the recent ASTM v. Public.Resource.Org (D.C. Cir. 2023) and ASTM v. UpCodes (3d Cir. 2026) fair-use rulings cover standards incorporated into law and lean noncommercial ([HPAC](https://www.hpac.com/clarks-remarks/article/21275383/after-10-years-dc-court-rules-on-fair-use-of-ashrae-standards), [LawNext](https://www.lawnext.com/2026/04/third-circuit-rules-that-upcodes-publication-of-incorporated-building-standards-is-likely-fair-use.html)). Not legal advice; if the tool is ever sold outside TruFicient, get a lawyer's read. For fitting losses, build a small in-house equivalent-length table from ASHRAE loss coefficients or SMACNA rather than reproducing Appendix 3; the ASHRAE Duct Fitting Database is a paid single-user subscription ([ASHRAE DFDB](https://www.ashrae.org/technical-resources/bookstore/duct-fitting-database)).

### The reference implementation: OpenStudio-HPXML

NREL's BSD-3-licensed [OpenStudio-HPXML](https://github.com/NREL/OpenStudio-HPXML) contains `hvac_sizing.rb`, about 5,800 lines implementing Manual J and Manual S openly: the Table 5D/5E infiltration coefficients, Table 7 duct factors, the PSF and CLF/CLTD bases, and the Manual S 2014 limits (oversize 1.15 single / 1.20 two-stage / 1.30 variable, undersize 0.90). Its README says it can be used for ACCA Manual J approval, and its [docs](https://openstudio-hpxml.readthedocs.io/en/latest/workflow_inputs.html) list the Manual J defaults it applies. Use it three ways: read it to understand the procedure, port the structure to TypeScript, and run it (via the OpenStudio CLI) as the golden-case oracle the engine is tested against. The BSD license covers NREL's code, not a license to republish ACCA's tables, so the same re-derivation rule applies to anything lifted from it.

### What permits actually require

IRC M1401.3 and IECC R403.7 say equipment shall be sized per ACCA Manual S "or other approved sizing methodologies" from loads per Manual J "or other approved" methods; ducts per IRC M1601 ([ICC design process](https://iccsafe.org/wp-content/uploads/Residential-HVAC-Design-Process.pdf)). "Approved" means by the building official, not by ACCA. ACCA's claim that only "Powered by Manual J" software can be considered compliant is advocacy ([ACCA blog](https://hvac-blog.acca.org/acca-approved-software-meets-manual-j-building-code-requirements/)); recognition is an ACCA review of functionality, defaults and sensitivities with no published fee or test suite.

In DFW specifically: NCTCOG's 2021 IRC amendments delete the Manual J criteria row from Table R301.2, noting that Manual J is handled by third parties and is not part of plan review ([NCTCOG](https://www.nctcog.org/getmedia/feafbc55-3c35-4022-bcab-6b07c95c7f9e/2021-IRC-Amendments-Final.pdf)). Dallas's residential energy forms require duct-blaster tests through a third-party energy provider and do not name Manual J ([Dallas Form-A](https://dallascityhall.com/departments/sustainabledevelopment/buildinginspection/DCH%20documents/WORK%20REQUIRING%20ENERGY%20CODE%20TRADE_RESIDENTIAL%20FORM-A.pdf)). Like-for-like change-outs need a mechanical permit only; a system-type change needs a load calculation; new central systems need duct plans (Dallas, Fort Worth, Plano, Frisco per [Permitmint](https://permitmint.com/permits/texas/dallas/hvac/), secondary source; confirm with each city).

So an internal tool needs no recognition. The practical risk is a reviewer rejecting an unfamiliar report; the mitigation is formatting output to ACCA's free Design Review Form fields and keeping CoolCalc or OpenStudio-HPXML for spot validation on permit jobs. Buy current copies of Manual J 8th, Manual S 2023 and Manual D 3rd for the office regardless; the normative Manual S text is free on ACCA's site.

## Existing software landscape

Nobody sells ACCA-grade J+S+D with blueprint tracing and phone photo/LiDAR capture in one web app for under about $100/month. CoolCalc at $50/user/month is the closest and is the product to beat on usability; Wrightsoft is the reference standard but is Windows-only, $900/yr, and widely called complex. The LiDAR entrants (Conduit, Amply) are fast at Manual J but do no Manual S or D and no duct drawing.

| Product | Platform | Price | ACCA approval (J / D) | Manual S | Drawing / import | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| [Wrightsoft Right-Suite Universal](https://wrightsoft.com/store) | Windows only | $900/yr residential; add-ons $250 | Yes / Yes | Yes | Right-Draw: PDF/DWG/DXF import, scale and trace, auto-branch, auto-place and auto-size registers, smart-checker | Reviews: complex, significant training, outdated UI, pricier since the MiTek acquisition ([ServiceTitan](https://www.servicetitan.com/blog/best-hvac-load-calculation-app), [HVAC School](https://www.hvacrschool.com/user_posts/why-is-wrightsoft-so-complicated-to-use-and-expensive-to-do-a-simple-block-load-calc-the-old/)) |
| Wrightsoft Right-J Mobile | Browser | $150/yr | Block-load only / no D | No | None | Whole-house block loads only |
| [Elite Rhvac 10.2](https://www.elitesoft.com/) + Ductsize + Drawing Board | Windows; Rhvac Online in browser | Desktop $599 permanent; bundle about $999; Online $239/yr | Yes / Yes | Yes, interpolates OEM data | Drawing Board: double-line ducts, fittings, mini-split head symbols, PDF/DXF import | Accurate, dated UI; Online version cramped and manual-entry only |
| [CoolCalc](https://www.coolcalc.com/) | Web + free iOS LiDAR scan app | $45/project or $50/user/mo | Yes / Yes | Yes, about 85 brands | LiDAR scan, floor-plan upload, satellite trace for block loads, free-draw | Works if you fully define everything; auto-placed windows/doors need cleanup; order-sensitive saves ([GBA](https://www.greenbuildingadvisor.com/question/cool-calc-2-0)) |
| [Kwik Model 3D](https://www.kwikmodel.com/purchase) | Windows (Unity) | $299/yr with EnergyGauge loads | Via EnergyGauge / 3D auto-size | Claimed | Builds the house from 3D boxes, draws ducts in 3D, auto-sizes from room loads | Recommended on HVAC School forums as cheaper and easier than Wrightsoft |
| [Adtek AccuLoad / AccuDuct](https://www.adteksoft.com/) | Windows; web mobile | Unverified | Yes / Yes | Yes | None found | Low profile |
| [Carmel HVAC ResLoad-J](https://apps.apple.com/us/app/id567612484) | iPad | $199.99 one-time | Yes / No | No | None | Reports with sanity checksums (Btuh/sq ft, sq ft/ton) |
| [Conduit Tech](https://www.servicetitan.com/blog/servicetitan-acquires-conduit-tech) (ServiceTitan, Sept 2025) | iPad Pro LiDAR | Quote-only annual contract | Yes / no D | Guidance only | 3D scan to 2D plan, AR equipment placement, no duct drawing | Manual J in 12–15 min vs. 90; needs building-science judgment; drains battery ([HVAC Today](https://hvactoday.com/lidar-with-load-calcs/2/)) |
| [Amply Energy](https://www.amply.energy/pricing) | iPad Pro, offline | $200/user/mo | Yes / no D | No (free spreadsheet) | Scan builds 3D model; pre-fills sq ft, age, construction from the address | Heat-pump and ductless sales focus |
| [Zero Homes](https://www.canarymedia.com/articles/heat-pumps/zero-homes-nabs-16m-heat-pump-installation) | Homeowner phone app | Not sold to contractors | Yes | — | Photos and video to remote designers | Signal that ACCA will approve photo-based remote Manual J |

ACCA's [approved software list](https://www.acca.org/approved-software) is the gating fact for permits: it lists no software as approved for Manual S, only J and D, and vendors ship Manual S modules anyway.

### What contractors complain about

- Measuring every window and wall and typing it in; Right-D inputs less intuitive than a spreadsheet.
- Unknown wall insulation swinging a load from 35,000 to 46,000 Btuh with no way to show the range.
- Duct inputs and ventilation type often not printing on reports, so reviewers cannot audit them (RESNET [verifier checklist](https://www.resnet.us/blog/wp-content/uploads/2013/03/Verifying-HVAC-Load-Calculations-2-28-13.pdf)).
- Requiring an internet connection in the field (Rhvac Online).

### What the best input workflows do

The standard question set, as seen in a [Right-J Mobile sample report](https://www.wrightsoft.com/wp-content/uploads/2023/11/RJMReport.pdf): location and elevation auto-fill design temps; infiltration by construction quality (tight, semi-tight, average, semi-loose, loose) or blower door; per-component construction codes carrying U and SHGC; area by orientation; occupants at bedrooms + 1; appliances 1,200 Btuh; duct location, leakage and insulation. Amply and Conduit pre-fill year built, square footage and construction type from property records before the visit. HVAC-Calc's window → wall → room → zone hierarchy is praised because every edit is traceable.

## The calculation engine

The engine is three chained modules: Manual J (loads), Manual S (equipment at design conditions), Manual D (duct sizing from room CFM). The block load sizes the system; room loads are always computed underneath it, because for ductless each zone's load is the sizing basis and for ducted the room CFM feeds the duct design ([ACCA "Hey Ed"](https://hvac-blog.acca.org/hey-ed-is-there-a-difference-between-a-block-load-and-a-room-by-room-load/)).

### Manual J (heat loss / gain)

The envelope math is standard heat transfer: each surface contributes U × A × ΔT (with Manual J's cooling ΔT adjusted by daily range and solar exposure), glazing adds a solar term based on SHGC, orientation and shading, infiltration and ventilation add sensible and latent terms from CFM and the grains difference, internal gains use 230 sensible / 200 latent Btuh per occupant and 1,200 Btuh for appliances, and duct losses are a multiplier on the subtotal driven by duct location, leakage and insulation. ICC/ACCA rank inputs by impact: design temperatures, glazing with shading, ducts and attic ceilings are high; infiltration and ventilation medium; floors, walls and internal gains low ([ICC CodeNotes](https://www.iccsafe.org/wp-content/uploads/17-14144_PMG_CodeNotes_Manual_J_FINAL_HIRES_noCrops.pdf)).

DFW design conditions (NOAA, DFW Airport 1988–2017): cooling 1% = 99°F DB / 75°F MCWB (0.4% = 100/75), heating 99% = 27°F (99.6% = 23°F), daily range 19°F, latitude 32.9°N, elevation 607 ft, no altitude correction ([NCEI](https://www.ncei.noaa.gov/pub/access/cebrequests/engineeringwx/ICAO_KDFW_EWD_IP.pdf)). Recommended defaults: 100°F / 27°F outdoor, 75°F 50% RH / 70°F indoor, grains difference about 35–37 (estimate from psychrometrics). Attic ducts matter more than anything after glazing: unsealed R-4 attic ducts add 20–35% to cooling load, sealed R-8 under 10% ([Open Exam Prep TX](https://open-exam-prep.com/study-guides/tx-hvac-contractor/load-calculations-system-sizing/texas-climate-design-conditions)).

Sanity check on every result, with the plausible band coming from the home's template, not a national average. Eric's field data from 1,000+ DFW installs puts unimproved 1960s–80s homes at roughly 350–450 sq ft per ton in Texas heat; code-built or upgraded homes (spray foam, low-e glass, sealed ducts, dehumidification) run far higher. Energy Vanguard's 40-house sample in hot/mixed climates averaged 1,431, but it skews toward code-built and renovated homes ([Energy Vanguard](https://www.greenbuildingadvisor.com/articles/dept/building-science/manual-j-load-calculations-vs-rules-thumb)). Each template carries its own band, refined from TruFicient's own assessments as they accumulate; a result outside the band means either upgrades or an input error, and the app asks which. The app should also flag the classic inflated inputs: doubled glass, U-1.25 windows, loose infiltration on a tight house, attic ducts entered uninsulated ([Energy Vanguard](https://energyvanguard.com/blog/how-to-cheat-on-a-manual-j-load-calculation)).

### Era-based defaults for DFW

Texas had no statewide code before 2001; 2000 IECC ran 2001–2011, 2009 IRC from 2012, 2015 IRC/IECC from Sept 2016 (still the state floor), and most DFW cities now enforce 2018 or 2021 locally ([SECO](https://comptroller.texas.gov/programs/seco/code/single-family.php), [DOE](https://www.energycodes.gov/status/states/texas)). These are estimates to seed the questionnaire; every value stays editable.

| Era | Ceiling R | Wall R | Windows (U / SHGC) | Infiltration (ACH50) | Attic ducts |
| --- | --- | --- | --- | --- | --- |
| Pre-1980 | R-11 to 19 | R-0 to 11 | Single clear, 1.0 / 0.80 | 10–15 | R-4, 20%+ leakage |
| 1980–2000 | R-19 to 30 | R-11 to 13 | Double clear, 0.50–0.60 / 0.50–0.60 | 8–10 | R-4 to 6, ~15% |
| 2000–2015 | R-30 to 38 | R-13 | Low-e, 0.35–0.40 / 0.30–0.40 | 5–7 | R-6, 8–12 cfm25/100 sf |
| 2015+ (2015/2018 IECC CZ3) | R-38 | R-20 or 13+5 | 0.32–0.35 / 0.25 | 3 | R-8, 4 cfm25/100 sf |
| 2021 IECC CZ3 | R-49 | R-20 or 13+5ci | 0.30 / 0.25 | 3 | R-8 |

Sources: [Texas 2018 compliance guide](https://www.nrhtx.com/DocumentCenter/View/9938/Texas-2018-Energy-Code-Compliance-Guide), [NAIMA Texas](https://insulationinstitute.org/wp-content/uploads/2025/05/N110-TX-Energy-Code-0425.pdf), [2021 IECC CZ3 table](https://www.nahb.org/-/media/NAHB/advocacy/docs/top-priorities/codes/code-adoption/nahb-suggested-amendments-2021-iecc.pdf). Radiant barrier (common in 2010+ DFW builds) cuts ceiling heat flux 40–50%.

### Manual S (equipment selection for inverter and mini-split)

The current standard is ANSI/ACCA 3 Manual S-2023 with Addenda A and B ([ACCA](https://acca.org/standards/manual-s)). Rules to encode for variable-capacity equipment, per ACCA's own summary ([ACCA blog](https://hvac-blog.acca.org/correctly-sizing-variable-capacity-heat-pump-equipment/)):

- Cooling: total capacity at design conditions between 0.90 and 1.30 of the Manual J total load; latent capacity ≥ latent load (the 2014 upper latent cap was removed in 2023). Single-speed stays at 1.15, two-speed 1.20. Some jurisdictions enforce the IECC floor of 1.15 (heat pumps 1.25), so the report should show both.
- Heating: max-speed capacity at the 99% temperature ≥ 1.00 × heat loss; minimum compressor capacity ≤ 0.80 × heat loss (the turndown check). Balance point from the OEM capacity curve against the load line; supplemental heat = load minus capacity at design.
- Always interpolate OEM expanded performance data at design conditions (airflow → indoor WB → between outdoor DB columns); never use AHRI nominal ratings. A real Manual S report for a Mitsubishi 12k shows the procedure ([GBA sample](https://images.greenbuildingadvisor.com/app/uploads/2022/12/29092910/49490_1672324149_Manual-S-2E-V1.00_Mitsubushi12k_122922.pdf)).
- Flag any zone whose load is below the indoor unit's minimum, and any multi-zone system where the sum of zone loads is below the outdoor unit's true minimum (the compressor's, not the per-head figure; e.g., an MXZ-SM36NAMHZ lists 22,500 Btuh minimum heating at 47°F) ([GBA](https://www.greenbuildingadvisor.com/question/min-capacity-on-multi-split-mitsubishi-units)).

Equipment data is the hard part. Mitsubishi/METUS publishes full expanded tables in the M-Series technical data book and per-pair submittals (e.g., PEAD-A18AA7 / SUZ-KA18NAR1: 18,000 rated / 7,500 min cooling, 24,700 / 10,900 heating at 47°F, 14,000 at 17°F, ESP settings 0.14–0.60 in. w.c.) ([submittal](https://images.greenbuildingadvisor.com/app/uploads/2025/07/27121511/65507_1753632911_M_PEAD-A18AA7_SUZ-KA18NAR1_SUBMITTAL-en.pdf), [tech data](https://images.greenbuildingadvisor.com/app/uploads/2022/01/04235601/Mitsubishi-M-Series-Tech-Data.pdf)). These are PDFs on MyLinkDrive with no API, and Diamond System Builder exposes none either, so the plan is a curated JSON equipment library built by extracting the tables for the 15–25 pairings TruFicient actually sells. The NEEP cold-climate list ([ashp.neep.org](https://neep.org/ASHP-Specification)) gives max/min/rated at 47/17/5°F as a spreadsheet download for cross-checking.

### Manual D (duct sizing)

The procedure is public and simple to encode: available static pressure = blower ESP minus component losses (1" filter 0.12, wet coil 0.20 unless internal, supply register 0.03, return grille 0.03, damper 0.02); total effective length = longest supply run plus longest return, straight length plus fitting equivalent lengths; friction rate = ASP × 100 / TEL, kept roughly in the 0.06–0.18 band; size each section at that friction rate for its design CFM; check velocity; balance ([procedure](https://open-exam-prep.com/study-guides/ca-hvac-contractor/hvac-planning-load-calcs/duct-design-manual-d), [component and fitting values](https://open-exam-prep.com/study-guides/al-hvac-contractor/duct-design-manual-d/manual-d-duct-sizing)). Representative equivalent lengths: mitered 90° elbow 35–50 ft (10–15 with vanes), smooth radius elbow 10–15, conical takeoff 15–20, straight takeoff 35–45, boot 30–50, reducer 10–15, return filter grille box about 30, plenum takeoff about 20. Velocity limits: supply trunk 700–900 fpm, branch 500–700, flex branch ≤600, return trunk 600–700, filter grille 300–400.

Two things specific to the Mitsubishi ducted line: available static is small (PEAD menu 0.14–0.60 in. w.c.; SEZ around 0.2; SVZ/PVA up to about 0.8), so short, fat duct runs are mandatory and the friction-rate worksheet will often land at the low end. And flex derating is severe: friction ×2 at 15% compression and ×4 at 30% by ADC figures, up to ×10 in Texas A&M tests of joist-supported flex ([Energy Vanguard](https://energyvanguard.com/blog/the-science-of-sag-flex-duct-and-air-flow)). The engine should carry a flex-installation-quality factor. Manual T register rules to encode: neck velocity under 700 fpm, register ΔP about 0.03, ceiling throw 75–120% of distance to wall, prefer two smaller ceiling registers on variable-speed systems ([HVAC School](https://hvacrschool.com/ok-but-how-do-i-actually-do-a-manual-t)).

Open item: the exact Manual S-2023 limit table and Manual J/D tables are paywalled; buy the three manuals (see the section on what is public vs. proprietary) and encode the tables verbatim from the books.

## The input experience

The goal is a block load in under ten minutes from a short questionnaire where every answer has a DFW default pre-filled by the home's build year, and the user only overrides what they saw on site. Two passes: a quick pass of about 12 questions that yields a sizing-grade block load, and a detail pass that unlocks room-by-room and the duct design.

### Quick pass (sizing-grade block load)

| # | Question | DFW default | Why it matters |
| --- | --- | --- | --- |
| 1 | Address (sets design temps, orientation from the map) | 100°F / 27°F, 19°F daily range | High impact |
| 2 | Year built (drives every era default below) | — | Seeds items 6–12 |
| 3 | Conditioned floor area and stories | — | Base of every area term |
| 4 | Ceiling height | 9–10 ft | Volume for infiltration |
| 5 | Which way does the front face? | From map | Glazing solar gain |
| 6 | Foundation | Slab-on-grade (pier-and-beam if pre-1960) | Floor term |
| 7 | Window amount: light / typical / lots of glass | Typical ≈ 15–18% of floor area | High impact |
| 8 | Window type: single / double clear / low-e | By era | High impact |
| 9 | Attic insulation: none / some / modern / upgraded | By era | High impact |
| 10 | Where are the ducts, and are they sealed? | Attic, unsealed (pre-2015) | 20–35% swing on cooling |
| 11 | House tightness: leaky / average / tight | By era | Medium |
| 12 | Bedrooms (occupants = bedrooms + 1) | 230 / 200 Btuh each; 1,200 appliances | Low |

### Detail pass (room-by-room and duct design)

Wall construction and exterior finish (brick veneer common), ceiling type (vented attic vs. cathedral), roof color and radiant barrier (assume yes for 2010+), per-wall or per-room window takeoff with overhang depth and screens, skylights, doors, mechanical ventilation (none pre-2015; exhaust or ERV for new), duct R-value and leakage (cfm25/100 sq ft), garage/knee-wall/bonus-room adjacency, fireplaces, kitchen gain (1,200 or 2,400 Btuh), lighting and plug loads on large homes, pool or hot tub. For each room: dimensions, exposures, windows, doors, and whether it will be its own ductless zone.

Every override is logged on the report as an assumption, so the customer and the permit office see what was measured versus assumed.

### Photos, blueprints and AI extraction

Media lives in WorkEdge (ADR-028); the design app references it by WorkEdge media id. What the AI pass can reliably do, and what it should never do:

- From a blueprint or plan PDF: read room names and dimension strings, count windows and doors per room, read the north arrow and the overall footprint, and propose a room list with a confidence flag per item. Geometry and room connectivity from a drawing are near-random for current vision models ([Blueprint-Bench](https://arxiv.org/pdf/2509.25229)), so the room list is a draft the user confirms, never auto-committed.
- From site photos: window type (single vs. double, grid style suggests era), attic insulation depth against a joist, duct condition and insulation, equipment nameplate text, exterior finish, overhang depth, shading. Each becomes a suggested answer in the questionnaire with the photo as evidence.
- From a scanning app: import Polycam or magicplan output for dimensions when the user wants speed on site; Apple RoomPlan arrives with the native shell (ADR-022, ADR-032).

The practical workflow in the field: walk the house taking photos per room, answer the quick pass on the phone, and let the detail pass and the duct design wait for the desk.

## Duct drawing tool

The drawing is a graph, not a picture: every symbol dropped on the canvas is a node and every run between two symbols is an edge carrying its length, shape and fitting type. That is what lets the app size the ducts from the drawing and print a duct schedule, and it is what Right-Draw and Elite Drawing Board do underneath their symbol palettes.

### Symbol palette

| Group | Symbols | Properties carried |
| --- | --- | --- |
| Equipment | Air handler (SVZ / PEAD / SEZ / PVA), ductless head (wall, ceiling cassette, floor), outdoor unit | Model, ESP setting, CFM, filter and coil losses |
| Plenums | Supply plenum, return plenum | Size, takeoff count |
| Fittings | Wye (45°), tee, reducer, radius elbow, mitered elbow (with and without vanes), conical takeoff, straight takeoff, boot | Equivalent length from the in-house EL table; auto-picked by angle of the connected runs |
| Runs | Trunk (rectangular metal), round metal branch, flex branch | Length (from the drawing scale), size (auto or locked), insulation R, flex compression quality |
| Terminals | Supply register (ceiling 1-way / 2-way, high wall, low wall, floor), return grille, filter grille, jump duct, transfer grille | Room assignment, design CFM, face velocity, throw |

### How drawing works

1. Pick a floor plan underlay: an uploaded blueprint or photo, a traced satellite footprint, or a blank grid. Calibrate the scale with two clicks of a known distance.
2. Draw rooms as rectangles (or confirm the AI-proposed room list), assign each its load from the calc; the room shows its design CFM.
3. Drop the air handler and plenums, then drag trunk runs; branches auto-route from the trunk to each register with a one-click "auto-branch" like Right-Draw. Endpoints snap to node ports; segments snap to the grid and to the underlay's wall lines.
4. The engine sizes every run at the friction rate and flags velocity limits, undersized returns, flex runs over the length limit, and registers whose throw misses the wall. Lock any size by hand and the rest re-sizes around it.
5. Export the drawing as SVG for the report and a duct schedule with lengths per size and a fitting count (a bill of materials).

A second, schematic view (React Flow) shows the same graph as a tree from plenum to registers, which is easier on a phone and handy for multi-zone ductless layouts where there is no ductwork, only heads and line sets.

### Desktop vs. phone

Desktop is the design surface: mouse precision, keyboard shortcuts, the full palette, the floor-plan underlay. The phone gets the field tasks: photos, the quick-pass questionnaire, viewing and marking up an existing drawing, and the schematic tree view with pinch-zoom. No product in the market does duct drawing well on a phone; Wrightsoft, Elite and Kwik Model all keep it on the desktop, and the LiDAR apps skip it entirely. Design the canvas with touch in mind (react-konva handles both), but do not chase full drawing on a 6-inch screen.

## Reports

One report, two audiences: a customer-facing summary up front in TruFicient branding, and the technical pages behind it that a permit reviewer or a RESNET verifier would audit. Reviewers' checklists ([Idaho DBS Manual S/J/D review](https://dopl.idaho.gov/wp-content/uploads/2023/10/HVAC-State-Manual-SJD-Implementation.pdf), [RESNET verifier checklist](https://www.resnet.us/blog/wp-content/uploads/2013/03/Verifying-HVAC-Load-Calculations-2-28-13.pdf)) and the leading products' report sets agree on the contents.

| Page | Contents |
| --- | --- |
| Customer summary | Home, design conditions, total heating and cooling load, recommended system with model numbers, sq ft per ton and Btuh per sq ft sanity figures, what was measured vs. assumed |
| Design conditions | Outdoor 1% / 99% temperatures, daily range, indoor setpoints and RH, grains difference, elevation, orientation |
| Construction components | Every wall, ceiling, floor, window and door type with R or U value, window U and SHGC, infiltration tightness class or ACH50, ventilation method |
| Load worksheet | Per component: U, area, orientation, heat transfer multiplier, Btuh heating and cooling; internal gains; duct loss and gain by location, leakage and R; totals with sensible / latent split |
| Room-by-room | Each room's heating and cooling Btuh, design CFM, and zone assignment (for ductless, each zone's load against its head's min and max) |
| Equipment selection (Manual S) | OEM capacity interpolated at design conditions, size factor against the 0.90–1.30 limit and the 1.15 code floor, latent check, heating capacity at 27°F, minimum-capacity turndown check, balance point, AHRI reference |
| Duct design (Manual D) | Available static worksheet, total effective length, friction rate, the drawing as SVG, a run-by-run schedule (CFM, size, velocity, length, fittings), return path, bill of materials |
| Assumptions and photos | The override log with the photo evidence behind each answer |

Elite prints ACCA Form 310 and the Energy Star HVAC design report; ACCA's one-page [plan review form](https://www.acca.org/viewdocument/residential-system-design-review-forms-examples) is a good template for the permit cover page. In DFW, Plano asks for a load calc only on a system-type change and a duct plan for new central systems ([Permitmint](https://permitmint.com/permits/texas/plano/hvac/)); Dallas does not publish residential requirements online. TDHCA weatherization requires J and S on every replacement ([TDHCA](https://tdhca.texas.gov/sites/default/files/community-affairs/wap/docs/WAP-BP-ManualJ.pdf)).

## Domain model, provenance and governance

Adopted from the Perplexity brief: everything belongs to a Property and a Project (which are WorkEdge's, per ADR-028), every accepted input carries where it came from, and every number on a report traces to a frozen calculation run.

### Hierarchy

```text
Property -> Project -> Assessment            (Property and Project live in WorkEdge; Assessment is RhoeFlow's)
Assessment -> Evidence (WorkEdge media ids, notes, voice)
Assessment -> Building model revisions (HPXML) -> levels / spaces / surfaces / openings / assemblies
Assessment -> Systems and thermal-zone mapping (room != zone != system)
Assessment -> Scenarios -> Calculation runs (frozen)
Assessment -> Equipment candidates
Assessment -> Duct network revisions (ports, segments, fittings, terminals)
Assessment -> Report revisions -> Share collections
```

Stable IDs, timestamps, schema versions and actor on every record; a room's display name is never its identity. The Assessment is the unit this app owns.

### Provenance on every input

| Category | Meaning |
| --- | --- |
| Measured | Field measurement with method and conditions |
| Documented | A source states it (plan note, submittal); installed applicability still matters |
| Assumed | Human-selected with a rationale |
| AI-proposed | Extraction or suggestion not yet accepted |
| Derived | Computed from accepted inputs |
| Defaulted | Software default with its source (the era table, IECC, NOAA) |
| Unknown | Not established; never coerced to zero. Splits in the UI into "didn't inspect" vs "inspected, can't tell" (ADR-027) |

AI proposals carry field key, value and unit, source file and region, rationale, the model's stated uncertainty and conflict state; they become engineering inputs only on acceptance. No invented confidence percentages. Uploaded documents are untrusted data: text inside a PDF cannot drive tools, network calls or other projects.

### Frozen runs and stale results

A calculation run references an immutable model snapshot, scenario, method IDs, engine version and weather library version, and stores an artifact bundle (accepted snapshot, normalized engine input, raw results, interpreted results, warnings, manifest). Dependency fingerprints on inputs, weather, methods, equipment, ducts and templates mean a change invalidates exactly the runs it affects, visibly. Issued reports are immutable; a numeric change needs a new run and a new report revision.

### Governance, sized for one builder

- Requirements: the 97-item register from the brief is the backlog (`02-perplexity-package/Truficient-Requirements-v3.csv`); each phase below names which IDs it closes.
- Decisions: an ADR log (`03-decisions/decision-log.md`).
- Methods: a method matrix with stable IDs (e.g., `MJ8.infiltration.lbl`, `MS2023.cooling_band.variable`, `MD3.friction_rate`) carrying source, edition, inputs, limits, code location and tests; method versions independent of app versions.
- Evidence: every work order from Claude Code reports files changed, requirement IDs, commands run and observed results; a screenshot is not evidence that the engineering works.

## Recommended tech stack and architecture

Build it as a web-first app on the stack you already run (Next.js on Vercel, Supabase for Postgres/auth/storage), with the calculation engine as a pure TypeScript package and the duct canvas on react-konva. Capacitor shells for the phone (ADR-032) arrive in phase 3 for capture. This keeps one codebase, one deploy, and lets Claude Code work the whole thing.

| Layer | Choice | Why, and the trade-off |
| --- | --- | --- |
| Platform | Next.js on Vercel; Capacitor shell for phone capture (phase 3) | Desktop drawing is mouse-driven and the browser already does that well. Expo/React Native would add a second runtime for little gain; Tauri/Electron adds nothing over a browser. |
| Calc engine | TypeScript package (`packages/calc`), no DOM or Node deps | Runs identically in the browser, in Vercel functions, and in any future mobile shell. A Python service would mean a second deploy, a network hop, and no offline. |
| Engine testing | Golden-case JSON fixtures + property tests in Vitest | One fixture per published worked example (Manual J/D sample houses, ASHRAE examples). Store a `calcVersion` on every report so old reports stay reproducible. |
| Duct canvas | [react-konva](https://konvajs.org/docs/faq.html) (MIT) | Unified mouse/touch, pinch-zoom, layers (floor-plan underlay vs. duct layer), snap-to-grid, thousands of objects at 60 fps. You own the data model, which auto-sizing needs. Cost: writing your own snapping/connector logic (a few hundred lines). |
| Not the canvas | tldraw | Not open source since v3; production needs a license key, commercial pricing is negotiated and opaque ([pricing](https://tldraw.dev/pricing), [license](https://tldraw.dev/legal/tldraw-license)). Vendor dependency on a core feature. |
| Schematic view (optional) | [React Flow](https://cdn.jsdelivr.net/npm/@xyflow/react@12.11.1/README.md) (MIT) | A duct tree is a DAG (plenum → trunk → wye → branch → register); React Flow gives a clean tree/schematic mode. Awkward for scaled layout over a floor plan, so it is a second view, not the editor. |
| Drawing data | Plain JSON graph in Supabase: `nodes[] {id,type,x,y,props}`, `edges[] {from,to,lengthFt,fittingType,shape}` | Konva only renders it. The same model feeds Manual D sizing and your own SVG export for the report. |
| PDF reports | Puppeteer + `@sparticuz/chromium-min` in a Vercel Node function, rendering a hidden HTML report route ([Vercel guide](https://docs.vercel.com/guides/deploying-puppeteer-with-nextjs-on-vercel)) | One design system for screen and print; charts and the duct SVG drop in unchanged. Stream the PDF to storage and return a signed URL to dodge the 4.5 MB response cap ([limits](https://vercel.com/docs/functions/limitations)). Cold starts of 2–4 s. Supabase Edge Functions cannot run Chromium ([limits](https://supabase.com/docs/guides/functions/limits)). |
| Blueprints | pdf.js render to an image layer + two-point scale calibration | User clicks two points of known distance (a 36 in door, a dimension string) or picks a paper scale (1/4" = 1'); store `scale` and `origin` on the plan. |
| AI extraction | Claude vision, draft-only | Models read dimension text, room names, window/door counts and orientation reasonably; they are near-random at geometry and connectivity ([Blueprint-Bench](https://arxiv.org/pdf/2509.25229)). Output a room list with confidence flags the user confirms; never auto-commit geometry. |
| LiDAR | Apple RoomPlan via the Capacitor shell (ADR-022/032); import from Polycam or magicplan ([API](https://apidocs.magicplan.app/)) as alternatives | — |
| Offline (later) | [PowerSync](https://powersync.com/blog/offline-first-apps-made-simple-supabase-powersync) | Built for Supabase (auth JWTs, RLS, logical replication). ElectricSQL's cloud is shutting down after the Databricks acquisition; avoid it. For now, run the engine client-side and cache the open job in IndexedDB. Keep assessment data as per-assessment JSON so PowerSync is one bucket per assessment later. |

Open-source floor-plan recognition ([CubiCasa5k](https://github.com/cubicasa/cubicasa5k)) exists but is trained on Finnish plans and needs a Python service plus fine-tuning; defer it.

## Build plan

Five phases over roughly six months (an estimate, not a commitment), each closed by a gate from the Perplexity brief's G0–G9 ladder, with the calc engine proven against OpenStudio-HPXML before a single screen is built. Phase 1 opens with a one-week R01 spike that pins an HPXML release and runs it design-only, so the TypeScript port has a target and the per-output tolerances are measured rather than guessed. Phase 2 is where the tool starts earning its keep on real TruFicient jobs; the duct canvas is the most expensive piece and comes last once the loads it depends on are trusted.

Each gate is a hard stop. G1 is the engine matching the NREL oracle within the tolerances set during the spike (floating-point, interpolation and method-difference tolerances tracked separately, never one blanket percentage); G2–G3 is the block load having run on ten real jobs and been reviewed; G5 is Manual S picks matching Diamond System Builder on the library pairings; G4 and G6 are calibrated plan intake and room mapping accepted without fabricated granularity; G7 is duct sizing with pressure accounting and fitting coverage on reference systems. Every phase also closes on a usability gate (ADR-026).

### Phase details

1. **Engine (weeks 0–5, est.; closes G0, G1; register IDs OWN-*, LIC-*, ENG-001 to 006, MTH-001/002, DAT-001/002, UNT-001, WTH-*, QA-001).** Week 0: R01 spike — pin an OpenStudio-HPXML release (verify whether v1.12.0 is current), install the runtime, run a design-only calculation on two reference houses, audit its defaults and sizing policy (it defaults to HERS, not ACCA), record output granularity. Then `packages/calc` in TypeScript: envelope, glazing, infiltration (tightness class and ACH50 paths), internal gains, duct factors, DFW design data, era defaults tagged *defaulted*. Port the structure from `hvac_sizing.rb`, re-deriving tables from ASHRAE and IECC. Method matrix and ADR log started here. Golden fixtures run through the HPXML CLI in CI. No UI; a CLI that takes a JSON assessment and prints the load with component contributions and warnings.
2. **Block load app (weeks 6–9, est.; closes G2, G3; ENG-007/008, DAT-003/004, GEO-001/002, QST-*, PRV-*, LOD-001/002/004, SCN-*, API-*, REV-*, RPT-001/002, MOB-001).** Next.js app on Vercel with Supabase auth and storage, built on the Property → Project → Assessment model with Property/Project read from WorkEdge through `JobStore`: the 12-question quick pass with sourced defaults, provenance on every input, photo evidence per field, scenarios against a frozen baseline, frozen runs with artifact bundles, the customer summary PDF via Puppeteer with the independent-software notice. Phone-friendly from day one. Start using it on sales calls.
3. **Manual S + native capture shell (weeks 10–13, est.; closes G5; EQP-001 to 006; ADR-032 native shell).** Extract expanded performance tables for the 15–25 Mitsubishi pairings TruFicient sells into a JSON library with document and page references; manual performance-table entry as the fallback for anything else; interpolate at design conditions, flag extrapolation; apply Manual S 2023 as method `MS2023.*` (0.90–1.30 cooling band, latent check, heating at 27°F, turndown check), outdoor-unit minimum never inferred from indoor sums; gross/net and fan-heat conventions explicit. Validate against Diamond System Builder picks. Capacitor shell for the capture module.
4. **Room-by-room and document intake (weeks 14–19, est.; closes G4, G6; GEO-003 to 005, INT-*, AI-*, LOD-003, AIR-*, RPT-003; ADR-025 portal).** Detail pass, per-room loads with method-faithful aggregation (room peaks are not summed to the block), the six airflow values in the schema, blueprint PDF upload with two-point calibration and per-page scale, vector vs. scan paths, Claude vision producing source-linked proposals the user accepts one by one or as a reviewed batch; full technical report pages; portable JSON/CSV export; customer portal.
5. **Manual D canvas, sizing mode (weeks 20–27, est.; closes G7; TER-001, DCT-001 to 008, DCT-010, EDT-*, TKF-001, LOD-005).** Week 20 is the drawing feasibility experiment the brief asks for (underlay, calibrated segment, connected wye, port snapping, terminal, undo/redo, print export), then the react-konva editor with the symbol palette, explicit ports (touching symbols don't connect), supply/return layers, vertical drops in route length, auto-branch, auto-sizing from the friction-rate worksheet, velocity and flex checks, complete supply-and-return path evaluation, SVG export, duct schedule and modeled takeoff separate from purchasing allowances. React Flow schematic view for phones and ductless layouts.
6. **Later, as needed (G8, G9; DCT-009, SHR-*, OFF-*, SEC-003, OPS-002/003, DAT-005).** Prediction mode (fan curve vs. network solve), PowerSync offline with conflict-preserving sync for engineering values, share collections with revocation, backup/restore test.

### Open decisions

- [ ] Buy Manual J 8th, Manual S 2023 and Manual D 3rd for the office before phase 1 so tables can be checked against the books.
- [x] Authorize the R01 spike (one week, no app code) as the first work order — WO-01, Oct 24, 2026.
- [ ] Which 15–25 Mitsubishi indoor/outdoor pairings go in the first equipment library.
- [ ] Whether the tool stays TruFicient-internal or becomes a Trade OS module later; the second changes the legal posture on re-derived tables and the sharing model.
- [ ] Whether to keep a CoolCalc seat ($50/mo) for spot validation on permit jobs during phases 2–4.
- [ ] Confirm with Dallas, Fort Worth, Plano and Frisco what they actually want on a system-type-change permit.
- [ ] Whether the repository will ever be public (ADR-012); affects license notices and what gets re-derived vs. referenced.

## Sources

Methodology and legal

- [NREL OpenStudio-HPXML (BSD-3)](https://github.com/NREL/OpenStudio-HPXML) and its [workflow inputs docs](https://openstudio-hpxml.readthedocs.io/en/latest/workflow_inputs.html)
- [ICC CodeNotes: Manual J](https://www.iccsafe.org/wp-content/uploads/17-14144_PMG_CodeNotes_Manual_J_FINAL_HIRES_noCrops.pdf) and [ICC residential HVAC design process](https://iccsafe.org/wp-content/uploads/Residential-HVAC-Design-Process.pdf)
- [ACCA approved software list](https://www.acca.org/approved-software), [ACCA on approved software and code](https://hvac-blog.acca.org/acca-approved-software-meets-manual-j-building-code-requirements/), [ACCA Manual S page](https://acca.org/standards/manual-s), [ACCA on sizing variable-capacity heat pumps](https://hvac-blog.acca.org/correctly-sizing-variable-capacity-heat-pump-equipment/), [ACCA block vs. room-by-room](https://hvac-blog.acca.org/hey-ed-is-there-a-difference-between-a-block-load-and-a-room-by-room-load/)
- [HPAC on ASTM v. Public.Resource.Org](https://www.hpac.com/clarks-remarks/article/21275383/after-10-years-dc-court-rules-on-fair-use-of-ashrae-standards), [LawNext on ASTM v. UpCodes](https://www.lawnext.com/2026/04/third-circuit-rules-that-upcodes-publication-of-incorporated-building-standards-is-likely-fair-use.html)
- [NCTCOG 2021 IRC amendments](https://www.nctcog.org/getmedia/feafbc55-3c35-4022-bcab-6b07c95c7f9e/2021-IRC-Amendments-Final.pdf), [Dallas residential energy Form-A](https://dallascityhall.com/departments/sustainabledevelopment/buildinginspection/DCH%20documents/WORK%20REQUIRING%20ENERGY%20CODE%20TRADE_RESIDENTIAL%20FORM-A.pdf), [Fort Worth 2021 IRC amendments](https://www.fortworthtexas.gov/files/assets/public/development-services/documents/building-code-local-amendments/2021-approved-local-amendments/irc-amendments-2021-ordinance-25383-03-2022.pdf), [SECO Texas code history](https://comptroller.texas.gov/programs/seco/code/single-family.php), [DOE Texas code status](https://www.energycodes.gov/status/states/texas), [TDHCA Manual J policy](https://tdhca.texas.gov/sites/default/files/community-affairs/wap/docs/WAP-BP-ManualJ.pdf)

Design data and defaults

- [NCEI engineering weather data, KDFW](https://www.ncei.noaa.gov/pub/access/cebrequests/engineeringwx/ICAO_KDFW_EWD_IP.pdf)
- [2021 IECC Chapter 3 fenestration defaults](https://seattle.gov/documents/Departments/SDCI/Codes/SeattleEnergyCode/2021SECResChapter3.pdf), [2021 IECC CZ3 envelope table](https://www.nahb.org/-/media/NAHB/advocacy/docs/top-priorities/codes/code-adoption/nahb-suggested-amendments-2021-iecc.pdf), [Texas 2018 energy code guide](https://www.nrhtx.com/DocumentCenter/View/9938/Texas-2018-Energy-Code-Compliance-Guide), [NAIMA Texas energy code](https://insulationinstitute.org/wp-content/uploads/2025/05/N110-TX-Energy-Code-0425.pdf)
- [LBL infiltration model](https://www.builditsolar.com/Projects/Conservation/BlowerDoor/LBLInfilModel.htm), [ACH50 to ACHnat](https://building-performance.org/bpa-journal/ach50-achnat/)
- Energy Vanguard: [rules of thumb vs. Manual J](https://www.greenbuildingadvisor.com/articles/dept/building-science/manual-j-load-calculations-vs-rules-thumb), [how to cheat on a Manual J](https://energyvanguard.com/blog/how-to-cheat-on-a-manual-j-load-calculation), [oversizing mini splits](https://www.energyvanguard.com/blog/can-you-oversize-a-mini-split-heat-pump/), [flex duct sag](https://energyvanguard.com/blog/the-science-of-sag-flex-duct-and-air-flow)
- Open Exam Prep: [Texas design conditions](https://open-exam-prep.com/study-guides/tx-hvac-contractor/load-calculations-system-sizing/texas-climate-design-conditions), [Manual D procedure](https://open-exam-prep.com/study-guides/ca-hvac-contractor/hvac-planning-load-calcs/duct-design-manual-d), [Manual D sizing values](https://open-exam-prep.com/study-guides/al-hvac-contractor/duct-design-manual-d/manual-d-duct-sizing)
- HVAC School: [friction rate](https://hvacrschool.com/determine-friction-rate-residential-duct-design/), [Manual T](https://hvacrschool.com/ok-but-how-do-i-actually-do-a-manual-t), [equivalent length](https://hvacrschool.com/equivalent-length-merry-go-round)
- Mitsubishi: [PEAD-A18AA7 / SUZ-KA18NAR1 submittal](https://images.greenbuildingadvisor.com/app/uploads/2025/07/27121511/65507_1753632911_M_PEAD-A18AA7_SUZ-KA18NAR1_SUBMITTAL-en.pdf), [M-Series technical data](https://images.greenbuildingadvisor.com/app/uploads/2022/01/04235601/Mitsubishi-M-Series-Tech-Data.pdf), [Diamond System Builder](https://www.mitsubishicomfort.com/commercial/software-apps/diamond-system-builder), [NEEP ccASHP list](https://neep.org/ASHP-Specification), [GBA on multi-zone minimums](https://www.greenbuildingadvisor.com/question/min-capacity-on-multi-split-mitsubishi-units), [sample Manual S report](https://images.greenbuildingadvisor.com/app/uploads/2022/12/29092910/49490_1672324149_Manual-S-2E-V1.00_Mitsubushi12k_122922.pdf)

Software landscape

- [Wrightsoft store](https://wrightsoft.com/store), [Right-Draw features](https://www.wrightsoft.com/?p=799), [Right-J Mobile sample report](https://www.wrightsoft.com/wp-content/uploads/2023/11/RJMReport.pdf), [Elite Software](https://www.elitesoft.com/), [CoolCalc](https://www.coolcalc.com/), [Kwik Model](https://www.kwikmodel.com/purchase), [Amply pricing](https://www.amply.energy/pricing), [ServiceTitan acquires Conduit](https://www.servicetitan.com/blog/servicetitan-acquires-conduit-tech), [HVAC Today on LiDAR load calcs](https://hvactoday.com/lidar-with-load-calcs/2/), [GBA on CoolCalc 2.0](https://www.greenbuildingadvisor.com/question/cool-calc-2-0), [ServiceTitan software roundup](https://www.servicetitan.com/blog/best-hvac-load-calculation-app)
- [Idaho DBS Manual S/J/D review](https://dopl.idaho.gov/wp-content/uploads/2023/10/HVAC-State-Manual-SJD-Implementation.pdf), [RESNET verifier checklist](https://www.resnet.us/blog/wp-content/uploads/2013/03/Verifying-HVAC-Load-Calculations-2-28-13.pdf), [ACCA design review forms](https://www.acca.org/viewdocument/residential-system-design-review-forms-examples), [Permitmint Plano](https://permitmint.com/permits/texas/plano/hvac/)

Technology

- [Konva FAQ and license](https://konvajs.org/docs/faq.html), [tldraw pricing](https://tldraw.dev/pricing) and [license](https://tldraw.dev/legal/tldraw-license), [React Flow](https://cdn.jsdelivr.net/npm/@xyflow/react@12.11.1/README.md), [canvas library comparison](https://www.pkgpulse.com/guides/fabricjs-vs-konva-vs-pixijs-canvas-2d-graphics-2026)
- [Vercel Puppeteer guide](https://docs.vercel.com/guides/deploying-puppeteer-with-nextjs-on-vercel), [Vercel function limits](https://vercel.com/docs/functions/limitations), [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Blueprint-Bench](https://arxiv.org/pdf/2509.25229), [CubiCasa5k](https://github.com/cubicasa/cubicasa5k), [magicplan API](https://apidocs.magicplan.app/), [PowerSync + Supabase](https://powersync.com/blog/offline-first-apps-made-simple-supabase-powersync), [PWA vs native for solo founders](https://www.buildmvpfast.com/blog/pwa-vs-native-vs-react-native-solo-founder-decision-2026)
