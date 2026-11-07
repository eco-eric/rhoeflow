<!-- Copy of the Claude Doc https://claude.ai/artifact/9k5TFbDhHQ8Buj8CAGVb5Z exported Nov 7, 2026. The Doc is the working copy; re-export here when it changes. -->

# RhoeFlow DFW Era Template Research

Nov 7, 2026 · @Eric Love

## Purpose and how to read this

This document is the evidence behind every value in RhoeFlow's DFW era templates, so each default can be traced to a code, a standard, measured field data or a described building practice.

A template seeds the load calc inputs the quick pass does not ask about. Every value it supplies is tagged *defaulted* with a source and is replaced by what the tech measures or documents on site. A template value is the best single guess for a house of that era and style, not a claim about any one house.

Each value in the era sections carries a confidence label:

- **High:** set by an energy code in force, or by measured field data from a large sample that includes Texas or the hot-humid South.
- **Medium:** a federal standard or national survey that covers the era, or measured data from a smaller or non-Texas sample.
- **Low:** period building practice described by credible sources, with no code or measurement behind it. Treat these as starting points to inspect.

One template per region. DFW is the first; other regions get their own document in this same format when RhoeFlow is used there.

## Methodology

Values are taken from the strongest source available for the era, in this order, and every source used is linked in the Sources section.

1. **Energy code in force:** the prescriptive tables of the code Texas or the city enforced for that year built. Texas had no statewide residential energy code before 2001, so this tier only exists from 2001 on.
2. **Federal minimum standards:** FHA and HUD Minimum Property Standards, which governed federally insured mortgages and shaped much of what builders did before state codes.
3. **Measured field data:** blower-door, duct-leakage and inspection results from field studies, preferring Texas or hot-humid samples.
4. **Housing stock surveys:** national surveys and models of the existing stock broken out by vintage and region.
5. **Described practice:** period trade literature and preservation documents describing how houses were built.

When sources give a range, the template stores the range and one value picked from it, using three rules.

- **Before 2001 (no code):** the pick leans to the poor end of the range, because an older house with better values usually shows it on site (replacement windows, a newer system) and the tech then overrides. For attic insulation the pick is the poor quarter of Texas homes of that age as they stand today, not the as-built value, because the load is for the house as it is now and most old attics have been topped up. Using the as-built R-0 for a pre-1950 house nearly doubled the cooling load on a test house. The as-built value stays as the low end of the range.
- **Code years with Texas field measurements (2012 to 2020):** the pick follows what the DOE Texas field studies measured in houses built to that code, rounded to the poor side, because that is what builders actually delivered. The code value is kept as one end of the range. Those studies measured Houston homes (climate zone 2A), so these picks carry medium confidence for DFW.
- **Code years without field measurements (2001 to 2011, and 2021 on):** the pick is the code value.

Unknown is never entered as zero. A value of zero, such as an uninsulated wall, is stated as an asserted default, and the basis says what to check on site.

## Code and standards timeline

Yes, the templates for 2001 on are built from the energy code that was in force when the house was permitted. Before 2001 there was no Texas energy code to go by, so those eras are built from federal mortgage standards, measured data and described practice instead.

### Before 2001: no energy code

- **Texas:** no mandatory statewide residential energy code before September 2001 ([Texas SECO code history](https://comptroller.texas.gov/programs/seco/code/single-family.php)). A 2002 Texas A&M Energy Systems Lab paper describes Texas as a state that "historically has had no uniform building codes" ([ESL-HH-02-05-16](https://core.ac.uk/download/79624025.pdf)).
- **Dallas and Fort Worth:** no local residential energy ordinance before 2001 was found. That is a gap in the evidence, not proof that none existed.
- **Federal mortgage standards:** FHA and HUD Minimum Property Standards governed federally insured homes. GAO found that the 1966 standards, revised in 1971, set a whole-house heat-loss limit rather than R-values for each part of the house ([GAO B-114860](https://www.gao.gov/assets/b-114860-096792.pdf)). HUD's own history lists revisions in 1958, 1973 and 1979, with energy requirements added under a 1978 law ([HUD MPS history](https://www.huduser.gov/Publications/pdf/mps_report.pdf)). No source gave the R-values a DFW builder would have used to meet those limits, so this doc does not cite any.
- **Utility programs:** Oncor (then TXU) started an ENERGY STAR Homes program in summer 2001. By 2002 it covered 6,800 homes, 15% of new DFW homes ([ACEEE case study](https://www.puc.state.pa.us/electric/pdf/dsr/dsrwg_sub_ECA-TXESHP.pdf)). No specs were found for the 1980s and 1990s "Good Cents" style programs.

### 2001 on: the codes in force

| Permit dates | Code | Climate zone 3 values that matter for a load | Source |
| --- | --- | --- | --- |
| Sept 1, 2001 to Dec 31, 2011, statewide | 2000 IECC with 2001 Supplement (Senate Bill 5) | Windows U 0.65, SHGC 0.40; ceiling R-30; wall R-13; slab R-0; no blower-door or duct test | [SECO](https://comptroller.texas.gov/programs/seco/code/single-family.php); [ESL-HH-02-05-16, Table 1](https://core.ac.uk/download/79624025.pdf); [NCTCOG regional amendments, Feb 2002](https://www.nctcog.org/getmedia/5954871e-ac88-4874-a03b-8a0a17c67413/ESL_2000_IECC_amend.pdf); SHGC 0.40 cap: [TDLR bulletin](https://tdlr.texas.gov/ihb/bulletins/TB0501080405.pdf) |
| Jan 1, 2012 to Aug 31, 2016, statewide | 2009 IRC Chapter 11 | Windows U 0.50, SHGC 0.30; ceiling R-30; wall R-13; under 7 ACH50 if tested (or visual inspection); attic supply ducts R-8, others R-6; duct leakage to outside 8 cfm25 per 100 ft² or less | [SECO](https://comptroller.texas.gov/programs/seco/code/single-family.php); [2009 IECC Chapter 4](https://codes.iccsafe.org/content/IECC2009/chapter-4-residential-energy-efficiency) |
| Same years, some cities | 2012 IECC adopted early: by July 2014 Plano, Frisco, McKinney, Denton, Carrollton and Richardson were on 2012, while Dallas, Fort Worth, Arlington, Irving and Garland stayed on 2009 | Ceiling R-38 and wall R-20 or 13+5 per PNNL; other 2012 values not opened | [TECCC 2014 adoption report](https://webarchive.library.unt.edu/web/20141113232425/https://eepartnership.files.wordpress.com/2013/02/teccc-2014-energy-code-adoption-report.pdf); [PNNL BASC](https://basc.pnnl.gov/information/2009-2021-iecc-and-irc-minimum-insulation-requirements-new-homes) |
| Sept 1, 2016 to today, statewide | 2015 IRC Chapter 11 (House Bill 1736) | Windows U 0.35, SHGC 0.25; ceiling R-38; wall R-20 or 13+5; 3 ACH50; attic ducts R-8 (3 in. and up) or R-6; total duct leakage 4 cfm25 per 100 ft² or less | [HB 1736](https://capitol.texas.gov/tlodocs/84R/billtext/html/HB01736F.htm); [2015 IECC Chapter 4](https://codes.iccsafe.org/content/IECC2015/chapter-4-re-residential-energy-efficiency); [DOE Texas status](https://www.energycodes.gov/status/states/texas) |
| From Jan 31, 2017, DFW option | NCTCOG 4 ACH50 tradeoff on the 2015 code | Up to 4 ACH50 if the house adds wall R-13+3, windows U 0.32, ceiling R-49 and R-8 ducts (or R-6 ducts plus a radiant barrier) | [Dallas tradeoff sheet](https://dallas.gov/departments/sustainabledevelopment/buildinginspection/DCH%20documents/pdf/BI_NCTCOG%20ACH%20Tradeoff_SF_Prescriptive%20and%20Performance.pdf); [NCTCOG compliance paths](https://www.nctcog.org/getmedia/041e3c83-d883-4963-bb5b-b9624f254eee/residentialbuildingscompliancepath.pdf) |
| From Sept 1, 2021, option | HERS rating path (House Bill 3215) | An energy rating score instead of the prescriptive table; does not change the base code | [HB 3215](https://capitol.texas.gov/tlodocs/87R/billtext/html/HB03215F.htm); [RESNET FAQ](https://www.resnet.us/wp-content/uploads/HB-3215-FAQs_08062021.pdf) |
| Arlington from Jan 1, 2023; Dallas from May 12, 2023 | 2021 IECC with NCTCOG amendments | Windows U 0.32, SHGC 0.25; ceiling R-42; wall about R-13 plus R-3 continuous (amendment text hard to read, medium confidence); slab R-0; 3 ACH50 and every house tested; total duct leakage 4 or less | [Dallas Chapter 59 ordinance](https://dallas.gov/departments/sustainabledevelopment/buildinginspection/DCH%20documents/pdf/code_amendments/2021_codes/23-0472.pdf); [NCTCOG 2021 amendments](https://www.nctcog.org/getmedia/ebdbf588-fb51-4d51-917f-7c711c4df1c3/2021-IECC-Amendments-Final_1.doc); [2021 IECC Chapter 4](https://codes.iccsafe.org/content/IECC2021P1/chapter-4-re-residential-energy-efficiency); [Arlington](https://www.arlingtontx.gov/Business/Planning-Development/Planning-Development/Building-Codes) |
| Fort Worth today | Still the 2015 IECC with local amendments; the city adopts every other cycle | Same as the 2015 row | [Fort Worth energy codes](https://www.fortworthtexas.gov/departments/development-services/permits/building-energy-codes) |
| Frisco from 2026 | 2024 IRC and 2024 IECC with amendments | Not used by any template yet | [Frisco adopted codes](https://www.friscotexas.gov/397/Adopted-Codes) |

Two things follow for the templates. First, year built alone does not tell you the code for a house built after 2021: a 2023 house in Dallas was built to the 2021 code, but a 2023 house in Fort Worth or most suburbs was built to the 2015 code. Second, Texas has been weighing an update to the 2024 IECC since late 2025 ([SECO adoption process](https://comptroller.texas.gov/programs/seco/code/adoption.php); [Sierra Club summary](https://www.sierraclub.org/texas/blog/2025/11/texas-moves-toward-updating-building-energy-codes-what-seco-s-public-input)), and no adopted update was found as of this writing.

## Era by era

Each era lists the value each template uses, what kind of evidence backs it, and how confident we are. **Code** means the value comes from the energy code text. **Measured** means a field study measured it. **Estimate** means it is built from national data, prototypes or described practice. R-values are in h·ft²·°F/Btu, window U in Btu/h·ft²·°F, and duct leakage to outside either as a fraction of fan flow or in cfm25 per 100 ft² of floor.

### Before 1950

DFW houses of this age are mostly frame bungalows and Minimal Traditional cottages on pier and beam, clad in wood lap siding, brick or Austin stone ([Dallas Stevens Park Village conservation district ordinance](https://dallascityhall.com/departments/pnv/Documents/AH%20Memos/StevensParkVillageOrdinance2026.pdf); [DFW foundation history, sponsored content](https://dallasnews.com/marketplace/shop-local/2024/08/15/the-history-of-foundation-construction-in-dallas)). They were heated by floor furnaces or wall heaters and built without central air ([ACHR News on 1950s heating](https://achrnews.com/articles/87033-the-1950s-pursuing-the-american-dream)), so any ducts are a later addition. Lawrence Berkeley Lab's prototype for pre-1950 houses in this region has no insulation in the walls, ceiling or floor ([LBNL-44636](https://simulationresearch.lbl.gov/dirpubs/44636.pdf)). Most have since been topped up: in Texas today only about 18% of pre-1950 homes still have an uninsulated attic ([ResStock](https://raw.githubusercontent.com/NREL/resstock/develop/project_national/housing_characteristics/Insulation%20Ceiling.tsv)).

| Item | Template value | Range | Basis | Confidence |
| --- | --- | --- | --- | --- |
| Ceiling | R-7 | 0 to 30 | Estimate: poor quarter of Texas pre-1950 homes today (ResStock: 18% uninsulated, 16% R-7, rest R-13 or more); R-0 as built (LBNL prototype) | Medium; measure the attic |
| Wall | R-0 | 0 to 11 | Estimate (LBNL prototype; ResStock 100% uninsulated) | Medium-high |
| Windows | U 0.95, SHGC 0.8 | U 0.95 to 1.20 | Code default for single-pane wood or steel when unlabeled ([IECC default tables](https://seattle.gov/documents/departments/sdci/codes/seattleenergycode/2015secresidentialchapter3.pdf); steel sash about U 1.3 per [NPS Brief 13](https://www.nps.gov/orgs/1739/upload/preservation-brief-13-steel-windows.pdf)) | Medium |
| Air leakage | 18 ACH50 | 13 to 25 | Estimate: 2.2 times a post-2000 house and 24% more for a crawlspace ([Chan 2013](https://eta-publications.lbl.gov/sites/default/files/chan_analysis_of_air_leakage.pdf)); ResStock median 20 for climate zone 3A; Florida homes this old measured about 17 ([Cummings 1990](https://www.fsec.ucf.edu/en/publications/html/FSEC-PF-217-96/index.htm)) | Medium-low |
| Ducts | R-4, 20% leakage to outside | 10% to 35% | Estimate ([ResStock duct assumptions](https://raw.githubusercontent.com/NREL/resstock/develop/project_national/housing_characteristics/Duct%20Leakage%20and%20Insulation.tsv); [Austin audits averaged 22%](https://www.greenbuildingadvisor.com/blogs/dept/green-building-news/austin-energy-audits-show-bunch-leaks)) | Low |
| Foundation | Vented crawlspace (pier and beam) |  | Described practice | Medium |

Template: **DFW pre-1950 pier and beam** (new).

### 1950s

The postwar ranch arrives. Windows moved from steel to aluminum after the war ([NPS Brief 13](https://www.nps.gov/orgs/1739/upload/preservation-brief-13-steel-windows.pdf); [NPS aluminum windows](https://www.nps.gov/orgs/1739/upload/tech-note-windows-22-historic-aluminum-windows.pdf)). Central air started showing up in DFW homes early in the decade; General Electric built air-conditioned homes in Dallas's East Ridge in 1952 ([ASHRAE history](https://www.ashrae.org/File%20Library/About/Mission%20and%20Vision/ASHRAE%20and%20Industry%20History/Sleeping-Soundly-on-Summer-Nights-A-History-of-Air-Conditioning-in-the-Home.pdf)). Pier and beam was still the common DFW foundation, but slabs were spreading nationally from the early 1950s ([HUD Cityscape](https://www.huduser.gov/PORTAL/periodicals/cityscape/vol25num1/ch10.pdf); [DFW foundation practice](https://hdfoundationrepair.com/foundation-problems-in-older-dfw-homes-what-to-expect/)), so there are two templates. LBNL's 1950 to 1979 prototype for the region has R-7 in the ceiling and nothing in the walls ([LBNL-44636](https://simulationresearch.lbl.gov/dirpubs/44636.pdf)).

| Item | Template value | Range | Basis | Confidence |
| --- | --- | --- | --- | --- |
| Ceiling | R-7 | 0 to 30 | Estimate: LBNL as-built prototype and the poor quarter of Texas 1950s homes today (ResStock: 11% uninsulated, 14% R-7, rest R-13 or more) | Medium; measure the attic |
| Wall | R-0 | 0 to 11 | Estimate (LBNL; ResStock 100% uninsulated) | Medium-high |
| Windows | U 1.20, SHGC 0.8 | U 0.95 to 1.20 | Code default for single-pane metal ([IECC default tables](https://seattle.gov/documents/departments/sdci/codes/seattleenergycode/2015secresidentialchapter3.pdf)) | Medium |
| Air leakage, pier and beam | 16 ACH50 | 12 to 22 | Estimate, as for pre-1950 | Medium-low |
| Air leakage, slab | 14 ACH50 | 10 to 20 | Estimate, crawlspace factor removed | Medium-low |
| Ducts | R-4, 20% to outside | 10% to 35% | Estimate | Low |

Templates: **DFW 1950s pier and beam** and **DFW 1950s slab** (both new).

### 1960s

Slab-on-grade overtakes pier and beam in DFW during the decade, but both are common ([DFW foundation history](https://dallasnews.com/marketplace/shop-local/2024/08/15/the-history-of-foundation-construction-in-dallas); [ResStock foundations](https://raw.githubusercontent.com/NREL/resstock/develop/project_national/housing_characteristics/Geometry%20Foundation%20Type.tsv)). Single-pane aluminum windows and uninsulated walls stay standard. FHA's 1966 property standards capped whole-house heat loss but gave no R-values ([GAO](https://www.gao.gov/assets/b-114860-096792.pdf)).

| Item | Template value | Range | Basis | Confidence |
| --- | --- | --- | --- | --- |
| Ceiling | R-11 | 0 to 30 | Estimate: owner field value, just under the poor quarter of Texas 1960s homes today (ResStock: 4% uninsulated, 16% R-7, 36% R-13); LBNL as-built prototype R-7 | Medium-low; measure the attic |
| Wall | R-0 | 0 to 11 | Estimate (ResStock 100% uninsulated) | Medium-high |
| Windows | U 1.20, SHGC 0.8 | U 0.95 to 1.20 | Code default, single-pane metal | Medium |
| Air leakage, slab | 13 ACH50 | 10 to 18 | Estimate: 1.9 times post-2000 ([Chan 2013](https://eta-publications.lbl.gov/sites/default/files/chan_analysis_of_air_leakage.pdf)); ResStock median 15 to 20 | Medium-low |
| Air leakage, pier and beam | 15 ACH50 | 11 to 20 | Estimate with crawlspace factor | Medium-low |
| Ducts | R-4, 20% to outside | 10% to 35% | Estimate | Low |

Templates: **DFW 1960s slab** and **DFW 1960s pier and beam** (both new).

### 1970s

Brick-veneer ranches on slab; post-tensioned slabs arrive in DFW around 1976 ([DFW foundation history](https://dallasnews.com/marketplace/shop-local/2024/08/15/the-history-of-foundation-construction-in-dallas)). The energy crisis made some builders add attic and wall insulation late in the decade, but no Texas code required it. In today's Texas stock, half of 1970s homes have no wall insulation and half have about R-7 ([ResStock](https://raw.githubusercontent.com/NREL/resstock/develop/project_national/housing_characteristics/Insulation%20Wall.tsv)).

| Item | Template value | Range | Basis | Confidence |
| --- | --- | --- | --- | --- |
| Ceiling | R-11 | 7 to 30 | Estimate: owner field value, just under the poor quarter of Texas 1970s homes today (ResStock: 8% uninsulated, 12% R-7, 22% R-13) | Medium-low; measure the attic |
| Wall | R-0 | 0 to 11 | Estimate, poor end (ResStock half R-0, half R-7) | Medium |
| Windows | U 1.20, SHGC 0.8 | U 0.95 to 1.20 | Code default, single-pane metal | Medium |
| Air leakage | 12 ACH50 | 9 to 16 | Estimate: 1.8 times post-2000 ([Chan 2013](https://eta-publications.lbl.gov/sites/default/files/chan_analysis_of_air_leakage.pdf)) | Medium-low |
| Ducts | R-4, 20% to outside | 10% to 35% | Estimate | Low |

Template: **DFW 1970s ranch on slab** (the old pre-1980 ranch template, narrowed to the 1970s).

### 1980 to 2000

Still no Texas code. A 2002 Texas A&M study modeled the typical DFW house of the time as built to the Model Energy Code minimum with a 10 SEER air conditioner ([ESL 2002](https://core.ac.uk/download/79624027.pdf)). In today's Texas stock, most 1980s homes have R-19 attics and R-11 walls, and most 1990s homes R-30 attics ([ResStock](https://raw.githubusercontent.com/NREL/resstock/develop/project_national/housing_characteristics/Insulation%20Ceiling.tsv)). The most common window of the period in climate zone 3A is double-pane clear glass in a metal frame, followed by single-pane ([ResStock windows](https://raw.githubusercontent.com/NREL/resstock/develop/project_national/housing_characteristics/Windows.tsv)).

| Item | Template value | Range | Basis | Confidence |
| --- | --- | --- | --- | --- |
| Ceiling | R-19 | 19 to 30 | Estimate (ResStock; LBNL 1980s prototype R-27) | Medium |
| Wall | R-11 | 11 to 13 | Estimate (ResStock: R-11 in 90% of 1980s homes) | Medium-high |
| Windows | U 0.80, SHGC 0.70 | U 0.55 to 1.20; SHGC 0.55 to 0.80 | Code default for double-pane clear in a metal frame | Medium |
| Air leakage | 9 ACH50 | 6 to 15 | Florida homes of this age measured about 8 ([Cummings 1990](https://www.fsec.ucf.edu/en/publications/html/FSEC-PF-217-96/index.htm)); 1.15 to 1.5 times post-2000 ([Chan 2013](https://eta-publications.lbl.gov/sites/default/files/chan_analysis_of_air_leakage.pdf)); ResStock median 10 to 15 | Medium-low |
| Ducts | R-4.2, 15% to outside | 10% to 30% | Estimate | Low |

Templates: **DFW 1980 to 2000, one story** and **two story**.

### 2001 to 2011

The first Texas code, the 2000 IECC, applies from September 2001. It set windows, ceiling and walls but required no blower-door or duct test. A DOE Building America study measured four new Centex homes near Dallas in 1999 and 2000 ([Chasar et al. 2002](https://core.ac.uk/download/79624048.pdf)).

| Item | Template value | Range | Basis | Confidence |
| --- | --- | --- | --- | --- |
| Ceiling | R-30 | 30 to 38 | Code ([ESL Table 1](https://core.ac.uk/download/79624025.pdf); [NCTCOG](https://www.nctcog.org/getmedia/5954871e-ac88-4874-a03b-8a0a17c67413/ESL_2000_IECC_amend.pdf)) | High |
| Wall | R-13 | 11 to 13 | Code | High |
| Windows | U 0.65, SHGC 0.40 | U 0.35 to 0.65; SHGC 0.30 to 0.40 | Code maximums ([TDLR on the SHGC cap](https://tdlr.texas.gov/ihb/bulletins/TB0501080405.pdf)). Meeting SHGC 0.40 takes low-E glass, which usually brings U well under 0.65, so check the label | High as a code value, medium as a typical value |
| Air leakage | 7 ACH50 | 5 to 10 | Measured: Dallas homes 5.0 and 5.1 ([Chasar 2002](https://core.ac.uk/download/79624048.pdf)); ResDB new homes about 5.6 ([Chan and Sherman](https://eta-publications.lbl.gov/sites/default/files/chan-sherman-lbnl-5552e.pdf)). Picked above them because no code limit applied and the Dallas homes were a research build | Medium |
| Duct insulation | R-6 | 4.2 to 8 | Estimate; the 2000 IECC duct table was not opened | Low |
| Duct leakage to outside | 12 cfm25 per 100 ft² | 8 to 14 | Measured: 10.8 and 13.5 in the Dallas homes ([Chasar 2002](https://core.ac.uk/download/79624048.pdf)) | Medium (two homes) |

Templates: **DFW 2001 to 2011, one story** and **two story**.

### 2012 to 2016

The 2009 IRC applies statewide from January 2012. Picks follow the DOE Texas field study of homes built to this code ([Phase I report](https://www.energycodes.gov/sites/default/files/2020-06/Texas_Residential_Field_Study_Report_Final.Rev_.Aug2017.pdf)). Plano, Frisco, McKinney and some other suburbs were already on the 2012 IECC, closer to the next era.

| Item | Template value | Range | Basis | Confidence |
| --- | --- | --- | --- | --- |
| Ceiling | R-30 | 30 to 38 | Code R-30; measured mean R-35.6 | High |
| Wall | R-13 | 13 | Code; measured assembly matches | High |
| Windows | U 0.35, SHGC 0.25 | U 0.32 to 0.50; SHGC 0.22 to 0.30 | Measured means U 0.34, SHGC 0.22; code maximums U 0.50, SHGC 0.30 | Medium-high |
| Air leakage | 5 ACH50 | 4 to 7 | Measured mean 4.7; code under 7 if tested | Medium-high |
| Duct insulation | R-6 | 6 to 8 | Measured attic ducts R-6.1; code R-8 for attic supply | Medium-high |
| Duct leakage to outside | 7 cfm25 per 100 ft² | 4 to 8 | Measured total leakage averaged 6.9, which caps leakage to outside; code limit 8 | Medium |

Templates: **DFW 2012 to 2016, one story** and **two story**.

### September 2016 to 2020

The 2015 IRC applies statewide from September 2016 and is still the state code. From 2017 DFW builders could take the NCTCOG tradeoff: up to 4 ACH50 in exchange for R-49 ceilings and better windows ([NCTCOG](https://www.nctcog.org/getmedia/041e3c83-d883-4963-bb5b-b9624f254eee/residentialbuildingscompliancepath.pdf)). Picks follow the DOE field study of 2015-code homes ([Phase III report](https://www.energycodes.gov/sites/default/files/2022-09/Texas_Field_Study_State_Report_Final_Report_pub.pdf)).

| Item | Template value | Range | Basis | Confidence |
| --- | --- | --- | --- | --- |
| Ceiling | R-30 | 30 to 49 | Measured mean R-32.5, only 43% met R-38; code R-38, tradeoff R-49 | Medium |
| Wall | R-20 | 13 to 20 | Code (20 or 13+5); the Houston study measured R-13 walls, which is the zone 2 code | Medium |
| Windows | U 0.35, SHGC 0.25 | U 0.32 to 0.35; SHGC 0.22 to 0.25 | Code; measured U 0.35, SHGC 0.22 | High |
| Air leakage | 5 ACH50 | 3 to 5 | Measured mean 4.3; code 3, DFW tradeoff 4 | Medium-high |
| Duct insulation | R-6 | 6 to 8 | Measured R-6.2; code R-8 for ducts 3 in. and up | Medium-high |
| Duct leakage to outside | 4 cfm25 per 100 ft² | 3 to 4 | Code total limit 4; measured total 3.7 | Medium-high |
| Radiant barrier | Yes |  | No prevalence data; NCTCOG tradeoff option 2 requires one | Low, ask on site |

Template: **DFW 2016 to 2020**. Most DFW houses built after 2020 outside Dallas and Arlington were also built to this code (see the timeline).

### 2021 on

Dallas (permits from May 12, 2023) and Arlington (from January 1, 2023) moved to the 2021 IECC with NCTCOG amendments. No field data exists yet, so picks are the code values.

| Item | Template value | Range | Basis | Confidence |
| --- | --- | --- | --- | --- |
| Ceiling | R-42 | 38 to 49 | Code as amended by NCTCOG and Dallas (base 2021 IECC is R-49) | Medium (amendment text hard to read) |
| Wall | R-20 | 13 to 20 | Code (base 2021 is 20, 13+5ci or 15ci; NCTCOG appears to allow 13+3ci) | Medium |
| Windows | U 0.32, SHGC 0.25 | U 0.30 to 0.32 | Code as amended | Medium-high |
| Air leakage | 3 ACH50 | 3 to 5 | Code; every house tested; 5 is the cap on any path | High |
| Duct insulation | R-8 | 6 to 8 | Code | High |
| Duct leakage to outside | 4 cfm25 per 100 ft² | 3 to 4 | Code total limit 4 | High |
| Radiant barrier | Yes |  | Assumption | Low, ask on site |

Template: **DFW 2021 IECC** (Dallas and Arlington permits from 2023).

## Measured field data

Code text says what a house was supposed to have. Measured data says what houses actually have. For houses built before about 2000 there is no Texas blower-door dataset broken out by year built, so older eras lean on national databases adjusted for climate and vintage. For new construction there are two DOE field studies measured in Texas homes, plus RESNET rating data.

### Converting leakage numbers

LBNL's Residential Diagnostics Database (ResDB) reports normalized leakage (NL), not ACH50. LBNL's own rule of thumb is that NL 0.55 is about 10 ACH50 ([Chan, Joh and Sherman 2013](https://eta-publications.lbl.gov/sites/default/files/chan_analysis_of_air_leakage.pdf)), roughly ACH50 = 18 × NL for a one-story house. A two-story house of the same NL has a lower ACH50, about 8 × NL, because NL is adjusted for height. Those two factors are our own arithmetic from the paper's definition of NL, so they carry medium confidence.

### Air leakage by vintage

| Vintage | What the data shows | Source | Confidence |
| --- | --- | --- | --- |
| All US homes | Median NL 0.67, about 12 ACH50; 5th to 95th percentile about 4 to 35 ACH50 | [Chan 2013](https://eta-publications.lbl.gov/sites/default/files/chan_analysis_of_air_leakage.pdf) | High |
| Before 1960 | 2.2 times as leaky as a house built after 2000, all else equal | [Chan 2013](https://eta-publications.lbl.gov/sites/default/files/chan_analysis_of_air_leakage.pdf); [LBNL 2012, Table 11](https://www.osti.gov/servlets/purl/1163524) | High for the ratio |
| 1960s | 1.9 times post-2000 | same | High for the ratio |
| 1970s | 1.8 times post-2000 | same | High for the ratio |
| 1980s | 1.5 times post-2000 | same | High for the ratio |
| 1990s | 1.15 times post-2000 | same | High for the ratio |
| Climate zone 3 humid | About 29% leakier than the coldest zones, all else equal | [LBNL 2012](https://www.osti.gov/servlets/purl/1163524) | High |
| Vented crawlspace (pier and beam) | About 24% leakier than slab | [Chan 2013](https://eta-publications.lbl.gov/sites/default/files/chan_analysis_of_air_leakage.pdf) | High |
| Pre-1960, CZ 3A modeled stock | Median 20 ACH50, mean about 22 to 24, 10th to 90th percentile 15 to 40 | [NREL ResStock Infiltration.tsv](https://raw.githubusercontent.com/NREL/resstock/develop/project_national/housing_characteristics/Infiltration.tsv) (built from ResDB) | Medium-low |
| 1960s and 1970s, CZ 3A modeled | Median 15 to 20, mean about 19 to 21 | same | Medium-low |
| 1980s, CZ 3A modeled | Median 15, mean 15 to 17 | same | Medium-low |
| 1990s, CZ 3A modeled | Median 10, mean 12 to 13 | same | Medium-low |
| Central Florida, homes over 20 years old in 1990 (pre-1970) | Averaged about 17 ACH50 | [Cummings et al. 1990, FSEC](https://www.fsec.ucf.edu/en/publications/html/FSEC-PF-217-96/index.htm) | Medium (hot-humid, measured) |
| Central Florida, homes built about 1980 to 1989 | Averaged about 8 ACH50 | same | Medium |
| Houston, older homes | Natural air changes rise about 0.07 per hour for each year of age | [ESL Texas A&M 1990](https://oaktrust.library.tamu.edu/bitstream/1969.1/6605/4/ESL-HH-90-10-16.pdf) | Medium |
| Low-income (weatherization) homes | Median NL 0.98, about 18 ACH50; median year built 1962 | [Chan and Sherman 2011](https://eta-publications.lbl.gov/sites/default/files/chan-sherman-lbnl-5552e.pdf) | High |
| Dallas, four new homes monitored 1999 to 2000 | Frame homes 5.0 and 5.1 ACH50 | [Chasar et al. 2002](https://core.ac.uk/download/79624048.pdf) | High relevance, tiny sample |
| New construction nationally, median built 2008 | Median NL 0.29, about 5.6 ACH50 one-story; Texas is a large share of the data | [Chan and Sherman 2011](https://eta-publications.lbl.gov/sites/default/files/chan-sherman-lbnl-5552e.pdf) | Medium-high |
| Texas homes built under 2009 IRC / 2012 IECC | Mean 4.7 ACH50, range 1.2 to 7.9, 65 homes | [DOE Texas field study, Phase I (2017)](https://www.energycodes.gov/sites/default/files/2020-06/Texas_Residential_Field_Study_Report_Final.Rev_.Aug2017.pdf) | High (Houston, CZ 2A) |
| Texas homes built under 2015 IECC | Mean 4.3 ACH50, 92% at or under 5 | [DOE Texas field study, Phase III (2022)](https://www.energycodes.gov/sites/default/files/2022-09/Texas_Field_Study_State_Report_Final_Report_pub.pdf) | High (CZ 2A) |
| HERS-rated homes, CZ 3A, 2024 ratings | Average 3.61 ACH50; 67% of new Texas homes are rated | [RESNET 2025 Data Trends](https://www.resnet.us/wp-content/uploads/2025-Data-Trends-Report-of-HERS-Rated-Homes_final.pdf) | Medium-high |

ResStock's 2000s and 2010s rows (median about 8 to 10 ACH50) are much looser than what was measured in Texas new homes, so this doc does not use ResStock after 2000.

### Duct leakage

Duct leakage in older homes is the thinnest part of the evidence. Nothing found measures it by year built in Texas.

| Population | What the data shows | Source | Confidence |
| --- | --- | --- | --- |
| ResDB, US homes | Duct leakage averages 18% of system airflow; leakage to outside is about 0.4 of total (preliminary) | [ResDB](https://resdb.lbl.gov/index.html) | Medium |
| Austin, 310 homes 10 or more years old (2009) | Average duct leakage 22%; 86% of ducted homes over 10% | [Green Building Advisor on Austin Energy audits](https://www.greenbuildingadvisor.com/blogs/dept/green-building-news/austin-energy-audits-show-bunch-leaks) | Medium-low (secondary report) |
| California existing homes, pre-retrofit | Median total leakage 27 cfm25 per 100 ft² | [LBNL-6378](https://eta-publications.lbl.gov/sites/default/files/lbnl-6378.pdf) | Medium (different climate) |
| Central Florida, 1990 | Return leaks averaged 10% of air handler flow | [Cummings et al. 1990](https://www.fsec.ucf.edu/en/publications/html/FSEC-PF-217-96/index.htm) | Medium |
| Dallas new homes, 1999 to 2000 | Leakage to outside 10.8 and 13.5 cfm25 per 100 ft²; total 19.7 and 23.6 | [Chasar et al. 2002](https://core.ac.uk/download/79624048.pdf) | High relevance, n = 2 |
| Texas, 2009 IRC era | Total leakage mean 6.9 cfm25 per 100 ft²; 34% of supply ducts inside | [DOE Texas Phase I](https://www.energycodes.gov/sites/default/files/2020-06/Texas_Residential_Field_Study_Report_Final.Rev_.Aug2017.pdf) | High |
| Texas, 2015 IECC era | Total leakage mean 3.7 cfm25 per 100 ft²; 41% of supply ducts inside | [DOE Texas Phase III](https://www.energycodes.gov/sites/default/files/2022-09/Texas_Field_Study_State_Report_Final_Report_pub.pdf) | High |
| ResStock assumption, all vintages | Leakage to outside of 10%, 20% or 30% (26%, 47%, 27% of homes); duct insulation R-4 before 2000, R-8 after | [ResStock Duct Leakage and Insulation.tsv](https://raw.githubusercontent.com/NREL/resstock/develop/project_national/housing_characteristics/Duct%20Leakage%20and%20Insulation.tsv) | Low (an assumption, not a measurement) |

### Insulation in today's older homes

ResStock's Texas distributions describe houses as they stand now, retrofits included, not as built. They are useful for knowing how often an old house has had its attic topped up. They come from builder surveys and Building America field data, not a Texas measurement, so confidence is low to medium.

| Year built | Ceiling insulation in Texas homes today | Walls |
| --- | --- | --- |
| Before 1950 | Uninsulated 18%, R-7 16%, R-13 28%, R-19 13%, R-30 22% | Uninsulated |
| 1950s | Uninsulated 11%, R-7 14%, R-13 23%, R-19 15%, R-30 28% | Uninsulated |
| 1960s | Uninsulated 4%, R-7 16%, R-13 36%, R-19 9%, R-30 26% | Uninsulated |
| 1970s | Uninsulated 8%, R-7 12%, R-13 22%, R-19 19%, R-30 31% | Half uninsulated, half R-7 |
| 1980s | R-7 8%, R-13 27%, R-19 40%, R-30 22% | R-11 in 90% |
| 1990s | R-19 27%, R-30 64%, R-38 8% | R-11 55%, R-15 27%, R-19 18% |

Sources: [ResStock Insulation Ceiling.tsv](https://raw.githubusercontent.com/NREL/resstock/develop/project_national/housing_characteristics/Insulation%20Ceiling.tsv) and [Insulation Wall.tsv](https://raw.githubusercontent.com/NREL/resstock/develop/project_national/housing_characteristics/Insulation%20Wall.tsv), region that includes Texas.

### Radiant barriers

No prevalence data was found for DFW or Texas. ResStock assumes no house has one, and neither Texas field study reports them. Any radiant barrier default in a template is an engineering assumption, and the app should ask.

## Template audit

All 10 templates that existed on November 7, 2026 were checked against this doc. Before this audit their values came from one planning table with about five general sources. Every template now cites this doc's section for its era, and each value cites the specific source behind it. The set grows from 10 to 14 templates.

### What changed

| Template | Value | Was | Now | Why |
| --- | --- | --- | --- | --- |
| Pre-1980 ranch on slab | Era | All pre-1980 | 1960 to 1969 | Pre-1980 is split by decade. The template keeps its id because open jobs and the calc test houses use it |
| Pre-1980 ranch on slab | Window U | 1.0 | 1.20 | Code default for an unlabeled single-pane metal window |
| Pre-1980 ranch on slab | Air leakage | 12 ACH50 | 13 | 1960s leakage ratio (Chan 2013) |
| Pre-1980 pier and beam | Whole template | All pre-1980 | Replaced by 1960s pier and beam | Split by decade |
| New |  |  | Pre-1950 pier and beam; 1950s pier and beam; 1950s slab; 1960s pier and beam; 1970s ranch on slab | Eric's ask for 1950s and 1960s houses, and the evidence that DFW construction changed by decade |
| 1980 to 2000, both | Window U and SHGC | 0.55 and 0.55 | 0.80 and 0.70 | Double-pane clear aluminum was the most common window, and those are its code defaults. 0.55 was the value for a vinyl or wood double-pane window |
| 1980 to 2000, both | Air leakage range | 8 to 10 | 6 to 15 | Measured and modeled data spread wider |
| 2001 to 2011, both | Window U and SHGC | 0.40 and 0.35 | 0.65 and 0.40 | The code maximums; nothing measured these windows. Real low-E windows are usually better, so the basis tells the tech to read the label |
| 2001 to 2011, both | Duct leakage to outside | 10 | 12 cfm25 per 100 ft² | Measured 10.8 and 13.5 in Dallas homes of the time |
| 2012 to 2016, both | Ceiling | R-38 | R-30 | The 2009 code required R-30; R-38 was the next code |
| 2012 to 2016, both | SHGC | 0.30 | 0.25 | Field study measured 0.22 |
| 2012 to 2016, both | Duct leakage to outside | 8 | 7 cfm25 per 100 ft² | Measured total leakage 6.9 caps it |
| 2016 to 2020 | Ceiling | R-38 | R-30 | Field study: mean R-32.5, only 43% met R-38 |
| 2016 to 2020 | Air leakage | 3 ACH50 | 5 | Field study mean 4.3; DFW tradeoff allows 4 |
| 2016 to 2020 | Duct insulation | R-8 | R-6 | Field study measured R-6.2 |
| 2016 to 2020 | Code basis text | "2018 IECC adopted locally by most DFW cities" | 2015 IRC statewide, still Fort Worth's code | No DFW city was found on the 2018 IECC; Dallas went from 2015 to 2021 |
| 2021 IECC | Ceiling | R-49 | R-42 | NCTCOG and Dallas amendment |
| 2021 IECC | Window U | 0.30 | 0.32 | NCTCOG and Dallas amendment |
| 2021 IECC | Duct leakage to outside | none | 4 cfm25 per 100 ft² | Code total leakage limit |
| 2021 IECC | Scope | Most DFW cities | Dallas and Arlington permits from 2023 | Fort Worth and the state are still on the 2015 code |

Values the audit confirmed unchanged: wall R-values in every era, 1980 to 2000 ceiling R-19, 2001 to 2011 ceiling R-30 and walls R-13, 2012 to 2016 windows U 0.35 and leakage 5 ACH50, 2016 to 2020 windows, and all duct insulation before 2012.

### Load check

Each template was run on the app's quick-pass reference house (1,600 ft², one story, Dallas weather, only the required answers) to see whether the result lands near Eric's field band of 350 to 450 ft² per ton for unimproved pre-1980 homes.

| Template | Cooling, Btu/h | ft² per ton |
| --- | --- | --- |
| Old pre-1980 ranch (before this audit) | 54,500 | 352 |
| Pre-1950 pier and beam | 66,100 | 291 |
| 1950s pier and beam | 67,900 | 283 |
| 1950s slab | 60,800 | 316 |
| 1960s slab | 56,000 | 343 |
| 1960s pier and beam | 62,700 | 306 |
| 1970s slab | 55,800 | 344 |
| 1980 to 2000, one story | 36,800 | 521 |
| 2001 to 2011, one story | 31,400 | 611 |
| 2012 to 2016, one story | 25,500 | 754 |

The slab templates from the 1960s and 1970s sit at the low edge of Eric's band. The pier-and-beam and 1950s templates come in below it, mostly from the uninsulated floor over the crawlspace and single-pane metal windows. An early run with the as-built R-0 attic for pre-1950 gave 156 ft² per ton, which is why attic picks now follow today's stock. Whether 280 to 320 ft² per ton is right for an unimproved 1950s pier-and-beam house is a question for Eric's field experience (see Open questions).

### What did not change in the calc tests

The app's calc test houses were run through an outside engine (OpenStudio-HPXML) with the old template values. They now use frozen copies of those old templates, so the tests still check the engine against the same answers while the live templates follow this doc.

## Open questions

These are the places where the evidence is thin, in order of how much they move a load. Each one says what would settle it.

1. **Duct leakage in older homes.** No measurement by year built exists for Texas. The 20% and 15% picks rest on a model assumption and one Austin audit summary. Duct-blaster results from Truficient jobs, logged with year built, would settle it within a few dozen houses.
2. **Pre-1980 loads below the field band.** The pier-and-beam and 1950s templates come in at 280 to 320 ft² per ton on the reference house, under Eric's 350 to 450 band. Either older pier-and-beam houses really run that heavy, or something (floor, windows, leakage) is too pessimistic. Eric's sizing history on 1950s pier-and-beam jobs would answer it.
3. **Blower-door data for DFW houses before 2000.** Older-era leakage is built from national ratios. A handful of Truficient blower-door tests per decade would replace the estimate.
4. **Which code a post-2020 house was built to.** Year built alone cannot tell a 2023 Dallas house (2021 code) from a 2023 Fort Worth house (2015 code). The app could add the city to the template suggestion.
5. **The 2001 to 2011 windows.** The code maximums (U 0.65, SHGC 0.40) are used because nothing measured these windows, but meeting SHGC 0.40 takes low-E glass, which is usually much better than U 0.65. NFRC labels photographed on jobs from this era would settle it.
6. **Radiant barriers.** No prevalence data was found for DFW. The 2016 on templates assume one; the attic photo should confirm it.
7. **FHA and HUD property standards before 1980.** The standards set a whole-house heat-loss limit, and no source gave the R-values builders used to meet it. HUD's archived standards documents would fill this in.
8. **Pre-2001 local codes and utility programs.** No Dallas or Fort Worth energy ordinance before 2001 was found, and no specs for the TU Electric programs of the 1980s and 1990s. City council records or utility archives would show whether any existed.
9. **The 2021 NCTCOG wall and ceiling amendments.** The amendment file is a marked-up Word document that was hard to read. Dallas's official Exhibit A would confirm R-42 and the wall options.
10. **Statewide code update.** Texas has been considering the 2024 IECC since late 2025. When it is adopted, a new template is needed.

When the region grows beyond DFW, each new region gets its own copy of this doc with the same structure, because codes, foundations and climate differ (Houston is climate zone 2A, and the Panhandle is 4B).

## Sources

Every source below was opened and read for this doc on November 7, 2026. Where a page is secondary or sponsored, that is noted.

### Energy codes and adoption

- [Texas SECO, single-family energy code history](https://comptroller.texas.gov/programs/seco/code/single-family.php)
- [Texas SECO, code adoption process](https://comptroller.texas.gov/programs/seco/code/adoption.php)
- [DOE Building Energy Codes Program, Texas status](https://www.energycodes.gov/status/states/texas)
- [Stone, DeVito and Nease, ESL-HH-02-05-16 (2002), 2000 IECC values for Texas](https://core.ac.uk/download/79624025.pdf)
- [NCTCOG regional amendments to the 2000 IECC (2002)](https://www.nctcog.org/getmedia/5954871e-ac88-4874-a03b-8a0a17c67413/ESL_2000_IECC_amend.pdf)
- [TDLR technical bulletin on the SHGC limit](https://tdlr.texas.gov/ihb/bulletins/TB0501080405.pdf)
- [2009 IECC Chapter 4](https://codes.iccsafe.org/content/IECC2009/chapter-4-residential-energy-efficiency)
- [2015 IECC Chapter 4](https://codes.iccsafe.org/content/IECC2015/chapter-4-re-residential-energy-efficiency)
- [2021 IECC Chapter 4](https://codes.iccsafe.org/content/IECC2021P1/chapter-4-re-residential-energy-efficiency)
- [IECC default window U-factor and SHGC tables (2015, Seattle adoption text)](https://seattle.gov/documents/departments/sdci/codes/seattleenergycode/2015secresidentialchapter3.pdf)
- [PNNL, minimum insulation by code edition](https://basc.pnnl.gov/information/2009-2021-iecc-and-irc-minimum-insulation-requirements-new-homes)
- [House Bill 1736 (2015)](https://capitol.texas.gov/tlodocs/84R/billtext/html/HB01736F.htm)
- [House Bill 3215 (2021)](https://capitol.texas.gov/tlodocs/87R/billtext/html/HB03215F.htm) and [RESNET FAQ](https://www.resnet.us/wp-content/uploads/HB-3215-FAQs_08062021.pdf)
- [TECCC 2014 city adoption report (archived)](https://webarchive.library.unt.edu/web/20141113232425/https://eepartnership.files.wordpress.com/2013/02/teccc-2014-energy-code-adoption-report.pdf)
- [NCTCOG 4 ACH50 tradeoff](https://www.nctcog.org/getmedia/041e3c83-d883-4963-bb5b-b9624f254eee/residentialbuildingscompliancepath.pdf) and [Dallas tradeoff sheet](https://dallas.gov/departments/sustainabledevelopment/buildinginspection/DCH%20documents/pdf/BI_NCTCOG%20ACH%20Tradeoff_SF_Prescriptive%20and%20Performance.pdf)
- [Dallas residential energy code FAQ (2016)](https://dallas.gov/departments/sustainabledevelopment/buildinginspection/DCH%20documents/pdf/BI_Residential%20Energy%20Code%20FAQs.pdf)
- [NCTCOG amendments to the 2021 IECC](https://www.nctcog.org/getmedia/ebdbf588-fb51-4d51-917f-7c711c4df1c3/2021-IECC-Amendments-Final_1.doc)
- [Dallas Chapter 59 ordinance (2021 IECC)](https://dallas.gov/departments/sustainabledevelopment/buildinginspection/DCH%20documents/pdf/code_amendments/2021_codes/23-0472.pdf) and [Chapter 57 (2021 IRC)](https://dallas.gov/departments/sustainabledevelopment/buildinginspection/DCH%20documents/pdf/code_amendments/2021_codes/23-0471.pdf)
- [Fort Worth building energy codes](https://www.fortworthtexas.gov/departments/development-services/permits/building-energy-codes)
- [Arlington building codes](https://www.arlingtontx.gov/Business/Planning-Development/Planning-Development/Building-Codes)
- [Frisco adopted codes](https://www.friscotexas.gov/397/Adopted-Codes)
- [Sierra Club Texas on the 2024 IECC update (advocacy blog)](https://www.sierraclub.org/texas/blog/2025/11/texas-moves-toward-updating-building-energy-codes-what-seco-s-public-input)

### Federal standards and program history

- [GAO B-114860 on HUD Minimum Property Standards](https://www.gao.gov/assets/b-114860-096792.pdf)
- [HUD Minimum Property Standards history](https://www.huduser.gov/Publications/pdf/mps_report.pdf)
- [HUD Cityscape on slab foundations](https://www.huduser.gov/PORTAL/periodicals/cityscape/vol25num1/ch10.pdf)
- [ACEEE case study, Texas ENERGY STAR Homes](https://www.puc.state.pa.us/electric/pdf/dsr/dsrwg_sub_ECA-TXESHP.pdf)

### Measured and modeled data

- [Chan, Joh and Sherman 2013, air leakage of US houses](https://eta-publications.lbl.gov/sites/default/files/chan_analysis_of_air_leakage.pdf)
- [Chan, Joh and Sherman 2012 LBNL report](https://www.osti.gov/servlets/purl/1163524)
- [Chan and Sherman 2011, LBNL-5552E](https://eta-publications.lbl.gov/sites/default/files/chan-sherman-lbnl-5552e.pdf)
- [LBNL-6378, California duct leakage](https://eta-publications.lbl.gov/sites/default/files/lbnl-6378.pdf)
- [LBNL Residential Diagnostics Database](https://resdb.lbl.gov/index.html)
- [Huang, Hanford and Yang, LBNL-44636 prototypes](https://simulationresearch.lbl.gov/dirpubs/44636.pdf)
- [NREL ResStock housing characteristics](https://github.com/NREL/resstock/tree/develop/project_national/housing_characteristics)
- [DOE Texas field study, Phase I (2017)](https://www.energycodes.gov/sites/default/files/2020-06/Texas_Residential_Field_Study_Report_Final.Rev_.Aug2017.pdf)
- [DOE Texas field study, final report (2022)](https://www.energycodes.gov/sites/default/files/2022-09/Texas_Field_Study_State_Report_Final_Report_pub.pdf)
- [RESNET 2025 Data Trends](https://www.resnet.us/wp-content/uploads/2025-Data-Trends-Report-of-HERS-Rated-Homes_final.pdf)
- [Chasar et al. 2002, Dallas Building America homes](https://core.ac.uk/download/79624048.pdf)
- [Cummings et al. 1990, Florida air and duct leakage](https://www.fsec.ucf.edu/en/publications/html/FSEC-PF-217-96/index.htm)
- [ESL 1990, Houston infiltration by house age](https://oaktrust.library.tamu.edu/bitstream/1969.1/6605/4/ESL-HH-90-10-16.pdf)
- [ESL 2002, DFW window study base case](https://core.ac.uk/download/79624027.pdf)
- [Green Building Advisor on Austin Energy duct audits (secondary)](https://www.greenbuildingadvisor.com/blogs/dept/green-building-news/austin-energy-audits-show-bunch-leaks)
- [EIA RECS 2020 state data](https://www.eia.gov/consumption/residential/data/2020/index.php?view=state)

### Construction practice

- [NPS Preservation Brief 13, steel windows](https://www.nps.gov/orgs/1739/upload/preservation-brief-13-steel-windows.pdf)
- [NPS Tech Note 22, aluminum windows](https://www.nps.gov/orgs/1739/upload/tech-note-windows-22-historic-aluminum-windows.pdf)
- [Dallas Stevens Park Village conservation district ordinance](https://dallascityhall.com/departments/pnv/Documents/AH%20Memos/StevensParkVillageOrdinance2026.pdf)
- [History of foundation construction in Dallas (sponsored content)](https://dallasnews.com/marketplace/shop-local/2024/08/15/the-history-of-foundation-construction-in-dallas)
- [Foundation problems in older DFW homes (contractor blog)](https://hdfoundationrepair.com/foundation-problems-in-older-dfw-homes-what-to-expect/)
- [ASHRAE history of home air conditioning](https://www.ashrae.org/File%20Library/About/Mission%20and%20Vision/ASHRAE%20and%20Industry%20History/Sleeping-Soundly-on-Summer-Nights-A-History-of-Air-Conditioning-in-the-Home.pdf)
- [ACHR News, the 1950s](https://achrnews.com/articles/87033-the-1950s-pursuing-the-american-dream)
- [CandysDirt on North Texas insulation (news blog)](https://candysdirt.com/2021/02/18/should-north-texas-homes-be-built-for-single-digit-weather/)

## Changelog

- **November 7, 2026:** first version. Researched code history, measured data and pre-1980 practice for DFW; audited the 10 existing templates; split pre-1980 into pre-1950, 1950s, 1960s and 1970s with slab and pier-and-beam variants (14 templates). Template changes are in a follow-up pull request in the RhoeFlow repo, and a copy of this doc is committed at claude/01-plan/dfw-era-template-research.md.
