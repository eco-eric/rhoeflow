# House facts, satellite view and permits from the address (ADR-043, draft)

Status: **Building (owner, 2026-11-04)**. Drafted 2026-11-04. The owner chose the house-facts
sources on 2026-11-04 (RentCast plus the county appraisal files), added `RENTCAST_API_KEY` and
the build started the same day on branch `property-data-plan` (draft PR 16). What was built, and
where it differs from the plan below, is under "As built". Nothing is merged or migrated yet.

## The ask

Owner, 2026-11-04: "set up being able to use some sort of satellite view", "pull data from
realtor.com, Zillow, or any other data sources that can tell us what's in the house", "keep it to
what's relevant", "even permits that we could search and find on the house", "I'm a big fan of
using Firecrawl", and "enhance our data search for the property in address lookup". So the
search runs from the address pick that ADR-041 already built, and only what changes a load calc
is kept.

## What happens when an address is picked

1. The tech picks one of the OpenRouteService suggestions (ADR-041). RhoeFlow now keeps the
   suggestion's latitude and longitude, which ORS already returns and `parseOrsFeatures` drops
   today, on the job (`rhoe.jobs.lat`, `lon`, `geocode_source`). A typed address is geocoded once
   through the same ORS key.
2. The server looks the house up (`GET /api/property?job=<id>`, signed-in callers, keys only on
   the server, like ADR-041). It first reads RhoeFlow's cache (`rhoe.property_facts`, one row per
   normalized address, reused for 180 days) and calls RentCast only on a miss. For an address in a
   county RhoeFlow has imported (Dallas and Tarrant first), it also reads that county's appraisal
   record from RhoeFlow's own table, which costs nothing per lookup.
3. The two records are merged field by field (see "How RentCast and the county files merge").
4. The job page shows a **House facts** card and a **satellite view** of the lot. Each fact
   carries its source and date ("County record via RentCast, Nov 4, 2026"). Nothing is hidden
   when a source has no answer; the field says "not in the record".
5. When the quick pass starts, the facts pre-fill its answers as `documented` with that source
   (provenance states, `packages/schema/src/provenance.ts`). Every pre-filled answer shows
   "From the record, check it" and stays editable; an edit becomes `measured` or `assumed` like
   any other answer. The review step lists every answer that came from a record.

## What is kept (and what is not)

| Fact | Quick-pass question it fills (quick-pass-map.md) | Note |
| --- | --- | --- |
| Year built | Q2, selects the era template | Most reliable field in every source |
| Living area | Q3 conditioned floor area | Appraisal living area can include rooms that are not conditioned, or miss a converted garage; the tech confirms |
| Stories (floor count) | Q3 stories | |
| Foundation type | Q6 slab or pier-and-beam | Maps Slab to slab; Crawl and Pier to vented crawlspace; anything else left blank |
| Garage spaces | Q3a attached garage | Side of the house still asked |
| Bedrooms | Q12 | |
| Heating type, cooling type | Shown only, not an input | Helps the tech know what to expect |
| Roof type, exterior wall | Shown only now; detail pass later | Roof colour and brick veneer matter in the detail pass |
| Pool | Shown only | Pool pump and equipment location |
| Recent permits (last 10 years) | Shown only, never an input | An HVAC change-out, roof, addition or remodel tells the tech what to look at; an addition means check the area |

Not kept: price, value, tax, sale history, owner names, schools, photos. They don't change a load
calc, and owner names are personal data RhoeFlow has no need to store.

The satellite view fills Q5 (which way the front faces): the tech taps the front of the house on
the image and RhoeFlow sets the azimuth, `documented` with the imagery source. Later it is the
"traced satellite footprint" underlay the plan already names for the duct drawing.

## Sources looked at (2026-11-04)

### Satellite imagery (no Google Cloud project)

| Option | Free each month | Then | Notes |
| --- | --- | --- | --- |
| **Esri World Imagery through ArcGIS Location Platform (recommended)** | 2,000,000 basemap tiles; 20,000 geocodes | $0.15 per 1,000 tiles | Free developer account and an API key; high-resolution imagery over DFW. A job view is a few dozen tiles, so RhoeFlow's volume stays inside the free tier. Esri's attribution line shows on the map. Commercial terms to be confirmed when the account is made |
| Mapbox Satellite | 750,000 raster tiles; 50,000 static images; 50,000 GL JS map loads | $0.25 per 1,000 raster tiles | Good second choice; Mapbox asks for a commercial licence only for listed industries (real estate, BI, vehicles), which RhoeFlow is not |
| MapTiler Satellite | 5,000 sessions | Flex $30/month | Free plan is for non-commercial use only, so it would be paid from day one |
| USDA NAIP (public domain) | Unlimited | — | 60 cm pixels, updated every two to three years: enough to see the house's outline, too soft to read the roof. Fallback with no key |

Map library: MapLibre GL JS (BSD) with the Esri raster tiles, so swapping providers is a
config change. Tiles are requested by the browser with a referrer-restricted key; no image is
stored unless the tech saves a snapshot to the job.

### House facts

Owner, 2026-11-04: "can we do both rentcast and county appraisal. i already have a rent cast
account? are there similar real estate sites we can use to pull data from?" So RentCast is the
main source and the county files are the free backstop and cross-check.

| Option | Coverage | Cost | Terms | Verdict |
| --- | --- | --- | --- | --- |
| **RentCast property records API (chosen, main source)** | Nationwide county assessor records | Developer $0 for 50 lookups/month ($0.20 each over); Foundation $74/month for 1,000 ($0.06 over); Growth $199 for 5,000 | Licensed API; their page says its data can be used for any use case the terms don't prohibit (terms page not read yet; check before a paid plan) | Has every field in the kept table: `yearBuilt`, `squareFootage`, `features.floorCount`, `features.foundationType`, `features.garageSpaces`, `bedrooms`, `features.heatingType`, `features.coolingType`, `features.roofType`, `features.exteriorType`, `features.pool`. No permits. Works for any account anywhere, which suits a multi-account app. The owner already has an account |
| **Appraisal district files (chosen, backstop and cross-check)** | DCAD (Dallas) and TAD (Tarrant) first; Collin next; Denton later | Free download | Public records; Collin CAD calls its data "public domain" | TAD's file (2022 layout) has year built, living area, garage capacity, pool, central heat and AC; bedrooms and baths marked "no longer used"; no stories or foundation. DCAD's residential layout is inside its download, not read yet. Collin publishes through the Texas Open Data Portal and an ArcGIS hub; its residential fields are not read yet. Denton's site did not load for our reader |
| County parcel layers on ArcGIS, through Firecrawl (`arcgis-com/gis-layers/query_layer`) | Varies by city | 5 Firecrawl credits a lookup | Public layers, each with its own licence line | Test below: the parcel layer gave year built only. Not needed once the county files are imported |
| ATTOM Property Data API (Estated is now part of ATTOM) | 99% of the US population, 158M+ properties | Sales-quoted only; free trial key | Terms not read | Has the house fields and a building-permit endpoint (300M+ permits, monthly updates, 94% of top cities). Worth a quote only if RentCast plus counties leave gaps or if permits are wanted from one vendor |
| Realie | 3,100+ counties | Free 25 lookups/month; $50/month for 1,250; $150 for 6,000 | Terms not read | Cheapest per lookup, but its pages list owner, value, tax, mortgage and zoning; no building fields are shown. Not a fit unless its field list proves otherwise |
| Regrid | 100% of US parcels, with building footprints | Self-serve plans not shown; 30-day free sandbox | API terms not read | Parcel lines and footprints, no house details listed. Could later give a footprint outline for the satellite view; not a house-facts source |
| Melissa Property, BuildZoom | Nationwide | Not read (their sites refused our reader) | Not read | Not assessed |
| Zillow, realtor.com, Redfin | Nationwide | — | All three forbid automated collection and commercial reuse. Redfin's terms (2.3.5): "You may not automatedly crawl or query the Services for any purpose or by any means ... unless you have received prior express written permission" (Zillow's and realtor.com's terms pages refused our reader; Zillow has sent cease-and-desist letters over scraping) | **Ruled out.** A paid app built on scraped listing data is a legal risk to the owner's business, whoever does the scraping |

### How RentCast and the county files merge

- RentCast is asked first. A county record, where RhoeFlow has that county, fills any field
  RentCast leaves blank, with the county named as its source.
- When both give a value and they agree (year built exactly; living area within 5%; same garage
  count), the fact pre-fills as `documented` with both sources named.
- When they disagree, the card shows both values with their sources and nothing pre-fills for that
  field; the tech picks one or enters what they see. A disagreement on living area often means an
  addition or a converted garage, which is worth a look on site.
- County files are imported once a year after the appraisal rolls are certified (July), keeping
  only the kept fields, keyed by normalized situs address, in `rhoe.county_property` (county,
  account number, fields, roll year). No owner names, values or tax amounts are imported.
- Outside imported counties, RentCast alone is used, so the app works the same in any market.

### Permits

No source covers DFW permits in one place. Each city runs its own system (Dallas, Fort Worth,
Plano, Frisco, Arlington, and so on), and Firecrawl's catalogue has typed permit providers for
other cities (San Antonio, Boston, Columbus and others) but none for DFW yet. Plan:

- Phase 1: no permit lookup; the House facts card links to the city's own permit search for
  the address's city so the tech can check by hand.
- Phase 2, first choice: Shovels, a licensed building-permit API (202M+ permits, 2,840+
  jurisdictions). Its free plan gives 500 credits a month with one year of history; paid plans
  start at $599/month, and its pricing page lists two different credit counts for the paid plans.
  Whether it covers Dallas, Fort Worth, Plano, Frisco and Arlington, and what its terms say about
  use inside an app, are not verified (its coverage page and terms did not load for our reader).
  A free Shovels account would answer both in a few minutes.
- Phase 2, second choice: ATTOM's permit endpoint, if ATTOM is quoted for other reasons.
- Phase 2, fallback: the City of Dallas and City of Fort Worth open-data permit feeds, read through
  Firecrawl (Alexandria ArcGIS/Socrata providers, about 5 credits a lookup) or directly, filtered
  to the address and the last ten years, shown as type, work description and issue date. Which
  feeds exist and what fields they carry has not been checked yet; that check opens phase 2.
- As Firecrawl adds DFW permit providers, they plug in behind the same `/api/property` call.

## Test lookup (2026-11-04)

Firecrawl's ArcGIS provider, City of Richardson parcel layer (built from DCAD and CCAD records),
a point in a Richardson neighbourhood: two parcels came back with situs address, legal
description, lot area and `yr_blt` 1960; no living area, stories or foundation. FEMA's USA
Structures footprint layer returned nothing at that point. Cost: 5 credits each. RentCast was not
tested because it needs a key, and no account was opened.

## Cost at RhoeFlow's volume

At about 50 new houses a month (Truficient today): imagery $0, RentCast $0 on the free plan
(the cache keeps repeat visits free; county files cost nothing per lookup), permits $0 in phase 1.
At 1,000 houses a month across accounts: imagery still about $0, RentCast $74/month, county files
$0. Permits in phase 2: Shovels' free plan may cover about 50 houses a month if a lookup is one or
a few credits (not verified); at 1,000 houses a month it would likely mean a $599/month plan, so
city open data through Firecrawl (about 5,000 credits, inside the $16 Hobby plan) stays the cheaper
route at that volume where the cities publish feeds.

## What the owner would set up

- An ArcGIS Location Platform account (free) and a key restricted to app.rhoeflow.pro, as the
  Worker variable `ESRI_BASEMAP_KEY` (public by nature, sent to the browser, referrer-locked).
- The owner's existing RentCast account: its API key added by the owner as the Worker secret
  `RENTCAST_API_KEY` on `rhoeflow-web` (Cloudflare dashboard, Worker settings, Variables and
  Secrets, type Secret; or `wrangler secret put RENTCAST_API_KEY`). Server only; never pasted
  into chat or committed.
- Phase 2 only, if chosen: a free Shovels account to check DFW coverage and terms.
- Phase 2 only: a Firecrawl API key as the Worker secret `FIRECRAWL_API_KEY`.

With no key set, each part switches off and the app works as it does today (as ADR-041 does for
ORS).

## Build outline (after the owner's yes)

1. Keep ORS coordinates on the job; migration adds `lat`, `lon`, `geocode_source` to
   `rhoe.jobs` and `rhoe.property_facts` (normalized address key, source, fetched_at, the kept
   fields only, raw response not stored).
2. `/api/property` with the cache, RentCast adapter behind a `PropertySource` interface, and the
   field-by-field merge above.
3. County import: a script per county (DCAD, TAD first) that reads the district's download,
   keeps the kept fields and normalized situs address, and loads `rhoe.county_property`; a
   `PropertySource` adapter reads it. Run by hand each year after certification.
4. Job page: House facts card and satellite view with the front-direction tap.
5. Quick pass: pre-fill as `documented` with source, "check it" marker, review list.
6. Tests: adapter parsing from recorded responses and sample county rows, the merge rules
   (agree, fill a blank, disagree), no-key paths, provenance on every pre-filled field, cache
   reuse.

## As built (2026-11-04)

- **Storage.** One row per job in `rhoe.job_sites` (migration `20261105120000_rhoe_house_facts`):
  the map point, where it came from (RentCast or an ORS geocode of the job's address), and up to
  five readings (one per source) holding only the kept fields, each with its source, record id and
  date. Row-level security is the job's account, like every other tenant table. The plan's
  per-address cache shared across accounts was dropped: it needs a cross-account table and its
  own expiry, and a lookup per job is well inside RentCast's 50 free a month at today's volume.
  `rhoe.county_property` is as planned and is read by normalized situs address ("1412 N ELM
  ST|DALLAS"); a county row is used only when exactly one matches.
- **When it runs.** The first time a job's page opens, and again only when the tech taps Look
  again. With no `RENTCAST_API_KEY` the lookup says it isn't set up and the job works as before.
- **Satellite view.** ~~USGS The National Map's "USGS Imagery Only" tiles at zoom 19.~~ Corrected
  2026-11-06 (ADR-044): that tile cache stops at zoom 16, so the zoom 19 tiles came back empty and
  the live view showed no picture. It now asks USGS The National Map's NAIP ImageServer
  (`USGSNAIPImagery/ImageServer/exportImage`) for one north-up image, 60 m each side of the
  address point (USDA NAIP, about 0.6 m, public domain, no key, no account), drawn in an SVG, so
  still no map library. One shared component (`app/j/[jobId]/satellite-map.tsx`) serves House
  facts and Q5. The tech taps the side of the house the front door is on; the bearing from the
  house, snapped to the eight quick-pass directions, answers Q5 as `documented` with the imagery
  as its source. "The dot isn't on the house" lets them move the house point first. With the
  `ARCGIS_API_KEY` secret set (owner, 2026-11-06), the map shows Esri World Imagery instead
  (zoom 19 tiles fetched by the Worker through `/api/imagery/tile/{z}/{x}/{y}`, key in the
  `X-Esri-Authorization` header, never in the browser), and falls back to NAIP if any tile fails.
  `lib/imagery-server.ts` holds the fetcher so the PDF report can use the same imagery.
- **Streets and zoom (ADR-045).** Road centre lines and names from the Census Bureau's TIGERweb
  (`TIGERweb/Transportation/MapServer`, layers 2, 6 and 8, public domain, no key), fetched by the
  Worker through `/api/streets` for 300 m round the point and drawn as blue dashed lines with names
  (`lib/streets.ts`). They tell the street from the paved alley many DFW houses back onto, which
  TIGER mostly leaves out. Checked on the owner's first test job: Middle Knoll Dr runs under the
  trees about 20 m north of the address point, and the paved strip south of the house is the
  alley. The map zooms in six steps from 25 to 220 m each side, by + and - or a pinch; Esri tiles
  follow the view from zoom 17 to 19. If Esri refuses a tile the map shows NAIP and, from
  `/api/imagery/status`, Esri's reason under the map.
- **Pre-fill.** Year built, living area, stories, foundation and bedrooms fill Q2, Q3, Q3a, Q6
  and Q12 as `documented` when the tech hasn't answered, with the cited sources and the note
  "From the property record; check it on site." Each fills once; a cleared answer is not filled
  again, and the card offers Use. Garage spaces are shown only: the record has no side, which
  Q4 needs. Disagreeing values pre-fill nothing; the card shows each source with Use this.
- **Permits.** A link to the city's own permit search for twelve DFW cities
  (`apps/web/lib/permits.ts`); other cities get a line saying to check the city's site.
- **Not built yet.** ~~The county import scripts.~~ Built 2026-11-07 (ADR-048), below.

## County records (ADR-048, 2026-11-07)

The files were read on GitHub's runners (the build container can't reach either district's
site), and the importers were written against them.

| | Dallas (DCAD) | Tarrant (TAD) |
|---|---|---|
| File | `DCAD{year}_CURRENT.ZIP`, about 200 MB, comma files, yearly | `000_Tarrant_All_Taxing_Units.zip`, about 740 MB (14 GB unzipped), fixed width, weekly |
| Homes | about 668,000 residential accounts | about 718,000 real property records |
| Year built, living area | yes | yes (living area adds up the ResMain rows of the largest improvement) |
| Stories, bedrooms | yes (0 or UNASSIGNED is unknown) | no |
| Foundation | yes (SLAB, PIER AND BEAM, POST, ...) | rarely (ConcSlab, PierBeamJo, Post) |
| Heating, cooling | the record's wording (CENTRAL FULL, GAS HEATERS, WINDOW, ...) | central heat and central air, present or not said |
| Roof, exterior | yes | codes, spaced out to read |
| Garage, pool | garage or carport and its size; pool | attached or detached garage or carport and its size; pool |
| Left out | accounts flagged EXCLUDE_OWNER (confidential owners) | |

- **What the tech sees.** County readings join RentCast's in House facts as before. Heating,
  cooling, roof and exterior walls show the county's own wording; a new shown-only line, Garage
  type, shows the county's garage wording. Neither county gives a car count, so the Garage line
  stays RentCast's.
- **Matching.** Street and city first ("1412 N ELM ST|DALLAS"). When nothing matches, the street
  and ZIP, because the post office's city often differs from the one the county files the house
  under (a Fort Worth mailing address in Haltom City). Houses outside any city are keyed
  UNINCORPORATED, so they match by ZIP. Several records at one address (condos, duplexes) are
  still not used, and a county read that fails leaves a note and doesn't stop the lookup.
- **Loading.** The `county-import` workflow (Actions, Run workflow): downloads the file, reads it,
  prints counts only (the repository is public, so the log never shows an address or account) and,
  with Load ticked, runs `load.sql` against `SUPABASE_DB_URL` in one transaction: stage, check,
  replace the county's rows, log the load in `rhoe.county_imports` with the file's SHA-256. A load
  with no rows, rows for another county, or fewer than half the rows already there is refused
  (`-v allow_drop=yes` overrides the last after a real drop). Every pull request that touches the
  importer runs the same read without loading, so a layout change fails before a load.
- **When.** DCAD certifies its roll in late July and posts the yearly file after; TAD's export is
  weekly. Once a year in August is enough for both; DCAD's file name carries the year, which the
  workflow asks for.
- **Size.** Both counties together are about 1.3 million rows of short text, a few hundred MB in
  Postgres, well inside the Supabase Pro plan's 8 GB.

## Supersedes and amends

Amends ADR-041 (the address pick now also stores coordinates and starts the property lookup)
and ADR-028/040 (RhoeFlow stores public facts about a job's house, cached per address, no owner
data). Uses ADR-035's opening for paid services on the owner's word.
