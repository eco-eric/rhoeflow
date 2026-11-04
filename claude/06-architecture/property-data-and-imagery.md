# House facts, satellite view and permits from the address (ADR-043, draft)

Status: **Open (owner)**. Drafted 2026-11-04 for the owner's decision. Nothing here is built, no
key is set and no account has been opened.

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
   normalized address, reused for 180 days) and calls the paid source only on a miss.
3. The job page shows a **House facts** card and a **satellite view** of the lot. Each fact
   carries its source and date ("County record via RentCast, Nov 4, 2026"). Nothing is hidden
   when a source has no answer; the field says "not in the record".
4. When the quick pass starts, the facts pre-fill its answers as `documented` with that source
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

| Option | Coverage | Cost | Terms | Verdict |
| --- | --- | --- | --- | --- |
| **RentCast property records API (recommended)** | Nationwide county assessor records | Developer $0 for 50 lookups/month ($0.20 each over); Foundation $74/month for 1,000 ($0.06 over); Growth $199 for 5,000 | Licensed API; their page says its data can be used for any use case the terms don't prohibit (terms page not read yet; check before paying) | Has every field in the table above: `yearBuilt`, `squareFootage`, `features.floorCount`, `features.foundationType`, `features.garageSpaces`, `bedrooms`, `features.heatingType`, `features.coolingType`, `features.roofType`, `features.exteriorType`, `features.pool`. No permits. Works for any account anywhere, which suits a multi-account app |
| Appraisal district bulk files (DCAD, TAD, later Collin and Denton) | One county each | Free download | Public records | TAD's file (2022 layout) has year built, living area, garage capacity, pool, central heat and AC; bedrooms and baths marked "no longer used"; no stories or foundation. DCAD's residential file layout is inside its download, not read yet. Means a nightly or yearly import per county and a different layout per county. Good free backstop for DFW, not for other markets |
| County parcel layers on ArcGIS, through Firecrawl (`arcgis-com/gis-layers/query_layer`) | Varies by city | 5 Firecrawl credits a lookup | Public layers, each with its own licence line | Test below: the parcel layer gave year built only. Useful as a cross-check, not the main source |
| Zillow (Firecrawl lists a `zillow-com` provider) and realtor.com | Nationwide | 5 credits | Both sites' terms forbid automated collection and commercial reuse of their data (Zillow's terms page and realtor.com's refused our reader today; Zillow has sent cease-and-desist letters to data companies over scraping) | **Ruled out.** A paid app built on scraped listing data is a legal risk to the owner's business, whoever does the scraping |
| ATTOM, Regrid, other licensed data vendors | Nationwide | Sales-quoted, typically far above RentCast at this volume | Licensed | Not needed now |

### Permits

No source covers DFW permits in one place. Each city runs its own system (Dallas, Fort Worth,
Plano, Frisco, Arlington, and so on), and Firecrawl's catalogue has typed permit providers for
other cities (San Antonio, Boston, Columbus and others) but none for DFW yet. Plan:

- Phase 1: no permit lookup; the House facts card links to the city's own permit search for
  the address's city so the tech can check by hand.
- Phase 2: the City of Dallas and City of Fort Worth open-data permit feeds, read through
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
(the cache keeps repeat visits free), permits $0 in phase 1. At 1,000 houses a month across
accounts: imagery still about $0, RentCast $74/month, permits in phase 2 about 5,000 Firecrawl
credits (inside Firecrawl's $16 Hobby plan).

## What the owner would set up

- An ArcGIS Location Platform account (free) and a key restricted to app.rhoeflow.pro, as the
  Worker variable `ESRI_BASEMAP_KEY` (public by nature, sent to the browser, referrer-locked).
- A RentCast account on the free Developer plan and its key as the Worker secret
  `RENTCAST_API_KEY` (server only).
- Phase 2 only: a Firecrawl API key as the Worker secret `FIRECRAWL_API_KEY`.

With no key set, each part switches off and the app works as it does today (as ADR-041 does for
ORS).

## Build outline (after the owner's yes)

1. Keep ORS coordinates on the job; migration adds `lat`, `lon`, `geocode_source` to
   `rhoe.jobs` and `rhoe.property_facts` (normalized address key, source, fetched_at, the kept
   fields only, raw response not stored).
2. `/api/property` with the cache, RentCast adapter behind a `PropertySource` interface
   (appraisal-district and Firecrawl adapters can be added behind it).
3. Job page: House facts card and satellite view with the front-direction tap.
4. Quick pass: pre-fill as `documented` with source, "check it" marker, review list.
5. Tests: adapter parsing from recorded responses, no-key paths, provenance on every pre-filled
   field, cache reuse.

## Supersedes and amends

Amends ADR-041 (the address pick now also stores coordinates and starts the property lookup)
and ADR-028/040 (RhoeFlow stores public facts about a job's house, cached per address, no owner
data). Uses ADR-035's opening for paid services on the owner's word.
