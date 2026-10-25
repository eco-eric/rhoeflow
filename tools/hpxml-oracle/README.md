# hpxml-oracle

The pinned OpenStudio-HPXML release that RhoeFlow's engine is checked against (ADR-004) and
the runner that reproduces the R01 spike's design-only runs (ADR-006).

- `pin.json`: versions, release URLs, SHA-256 digests, schema version, weather file.
- `run-design-only.mjs`: runs `run_simulation.rb --skip-simulation` on an HPXML file after
  checking that the installed OpenStudio and OpenStudio-HPXML match the pin.

```bash
# dev machine (paths default from pin.json)
node tools/hpxml-oracle/run-design-only.mjs claude/09-spikes/r01/ranch-1960s-dfw.xml /tmp/ranch
# elsewhere
OPENSTUDIO_EXE=/opt/openstudio/bin/openstudio OPENSTUDIO_HPXML_DIR=/opt/OpenStudio-HPXML-v1.12.0 \
  node tools/hpxml-oracle/run-design-only.mjs some.xml out
```

Outputs land in `<out>/run/`: `in.xml` (defaults tagged `dataSource='software'`),
`results_annual.json`, `results_design_load_details.json`, `run.log`. The oracle accepts only
`.xml` input files, and on Windows output paths must stay under about 250 characters (the
runner refuses longer ones rather than let Ruby fail with a misleading "No such file" error).

## Reference-mode check (CI job `oracle`)

```bash
node tools/hpxml-oracle/check-fixtures.mjs --out <dir>
```

For every `packages/calc/fixtures/*.fixture.json`: runs the RhoeFlow engine and writes an
artifact bundle, serializes the Assessment with `@rhoeflow/hpxml`, runs the oracle
design-only, compares totals and components with the engine and the fixture's `expected`
block using `packages/calc/fixtures/tolerances.json`, lists the oracle's load-affecting
software defaults, and writes `reference-report.json` plus the oracle outputs into the bundle.
Exits 1 on any mismatch.

`assembly-r-oracle.rb` generates the oracle values for `MJ8.construction.assembly_r`
(`packages/calc/fixtures/oracle/assembly-r.json`); run it with the pinned `openstudio`.

Install on a fresh machine: download the two archives named in `pin.json`, verify the digests,
extract to any user folder, no elevation needed. Findings and the reference-house runs:
`claude/09-spikes/r01-hpxml-findings.md`. Wiring this into CI is WO-02.
