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
`results_annual.json`, `results_design_load_details.json`, `run.log`.

Install on a fresh machine: download the two archives named in `pin.json`, verify the digests,
extract to any user folder, no elevation needed. Findings and the reference-house runs:
`claude/09-spikes/r01-hpxml-findings.md`. Wiring this into CI is WO-02.
