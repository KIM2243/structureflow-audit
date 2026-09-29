# Falcon Shadow Validation

## Current status

**REAL_DATA_VALIDATION = NOT_RUN**. No actual Kiwoom historical OHLCV was supplied. Repository inspection found no captured historical dataset, and the existing authenticated API could not be used. No new provider, download integration or fabricated market dataset was added. The user explicitly limited this stage to offline harness preparation.

Current result: **NOT READY** for production integration, because real-data evidence remains unverified; this is not a finding that the engine is defective. All empirical counts, prefix results, initialization convergence and market examples are **UNVERIFIED_REAL_DATA**, not zero. A–I from the requested real-data checklist remain UNCERTAIN; J remains NOT READY pending real-data validation and external review.

## Engine Versions

- Audit baseline: `88214a4a097c95cbfd66dbf5deeeb7ada1f017e5`.
- Externally reviewed Falcon engine: `208cfb37290f263ba06e129d8b96e5bd20fc3846`.
- Subsequent harness/document commits do not modify the Falcon engines, production gates or baseline.

## Input contract

The user's supplied lecture specification is the validation authority; no fresh independent video review or general SMC extension is claimed. Swing uses wick anchors and completed strict close breaks; first opposite protected close reverses immediately. Strong is the breakout origin and Weak the continuation target. Internal runs independently; failed extreme extension begins a Candidate, subsequent old-extreme extension confirms it, and a previously confirmed Minor wick break changes direction without requiring a close. Newly confirmed same-bar Minor deferral is an implementation choice, not a lecture rule. P/D equilibrium is (high + low)/2 and not a reversal trigger. HTF is expectation, LTF confirmation/invalidation; opposite states may be pullback. Phase letters compare position direction to Swing then Internal. Opposite H4/H1 CHoCH after Swing BOS may indicate pullback, and original-direction CHoCH at appropriate P/D may indicate realignment; the harness does not certify these chronological/P-D relationships without actual case review.

Primary format: UTF-8 JSON. Required metadata: nonempty `symbol`, `source`, valid IANA `timezone`. Required `timeframes`: `4H`, `1H`, `15m`, `5m`, `1m`; optional `1D`. Each value is a Candle array with `date`, `open`, `high`, `low`, `close`, `volume`. Dates must have an explicit ISO timezone offset or Z and represent bar **open** time. Numbers must be JSON numbers, not strings. All arrays belong to the same symbol/source/timezone. Optional frame/candle identity metadata must agree with the root.

Optional `capturedAt` is an ISO acquisition cutoff (defaults to execution time); neither it nor any candle timestamp may be in the future. Optional `period: {start, end}` selects a fixed overlapping period. Without it the tool derives common coverage. Earlier supplied candles are retained as warm-up; per-frame statistics include that warm-up and MTF records are restricted to the shared period. Input counts and processed counts are reported separately. No row is silently repaired, reordered, deduplicated or discarded as invalid.

At least 3 valid input bars per frame are required for an executable audit; this is an input sanity check, **not a trading warm-up or sufficient statistical sample**. All finite OHLCV, positive low, OHLC bounds, nonnegative volume, strict time order and unique dates are checked. Invalid input aborts before engine execution and produces `INPUT_VALIDATION_FAILED`, with a frame/bar error. Completely disjoint periods fail. Short overlap, unavailable completed bars, unknown provenance and suspect nominal/cross-frame alignment warn. Session gaps, holidays, DST and shortened H4 bars are not automatically declared corrupt or filled.

Optional provenance, separate from candle arrays:

```json
"frameMetadata": {
  "4H": {"derived": true, "derivedFrom": "1H", "aggregation": "StructureFlow session aggregation"},
  "1H": {"derived": false}
}
```

`derived: false` is the input provider's native declaration, not independently certified by the tool. Missing provenance is `null` plus `PROVENANCE_UNKNOWN`; it must not be called native. A derived frame must supply `derivedFrom` and `aggregation`. Native H4 and StructureFlow H1→H4 should be provided as **two separate dataset files** with identical root metadata/period and run to separate output files for comparison. The harness does not implement a new aggregation path. Optional 1D is audited as context only and is not an entry gate.

CSV is not supported in this version. No CSV dependency was added; use the documented Candle JSON contract. Do not rename CSV to JSON.

## Run

From repository root, with the existing Node >=22.13 runtime:

```sh
node --experimental-strip-types scripts/falcon-realdata-validate.mjs data/falcon-validation/dataset.json
```

Default output: `artifacts/falcon-shadow-validation.json`. An optional second argument selects the output filename. Inputs under `data/falcon-validation/` and all `artifacts/` are gitignored; use these paths and do not commit actual market data. No API call, authentication, server allocation, deployment or automatic order occurs.

Without an input argument, the script writes a `NOT_RUN` report without empirical counts. Invalid supplied data exits nonzero, writes the validation failure and never substitutes synthetic candles. An input labeled `synthetic: true` always retains `REAL_DATA_VALIDATION: NOT_RUN`, even when harness unit checks execute. An unmarked external dataset is labeled `EXECUTED_UNVERIFIED_PROVENANCE`; source declarations alone do not prove real Kiwoom provenance or lecture conformance.

Format demonstration only:

```sh
node --experimental-strip-types scripts/falcon-realdata-validate.mjs docs/examples/falcon-dataset.example.json artifacts/falcon-synthetic-validation.json
```

The example contains deliberately tiny **synthetic** arrays and cannot be used as empirical evidence.

## Output and checks

- Input metadata, SHA256, coverage and counts; separate raw coverage and processed counts.
- Per-bar legacy Swing/Internal, protected/weak, latest events; Falcon Swing/Internal, protected/weak, active extreme, Candidate, confirmed Minors, latest events and current ambiguity.
- Swing/Internal direction differences, same-bar CHoCH timing/target differences, mechanism categories and detailed reasons. Categories are local evidence labels; persisting divergence with unresolved cause is OTHER. TYPE1_CLOSE_DIFFERENCE is reserved rather than asserted without common-target evidence.
- Event/point temporal inequalities; broken target identity and observation ordering; completed-close Swing events, protected reversal without a second BOS; confirmed-only wick CHoCH, direction changes and same-bar exclusion. Candidate-target violations count Internal CHoCH target mismatches only.
- Every prefix is recomputed against full history for events, confirmed points and reconstructed trend. Future candles cannot change event index/kind/direction/confirmation time without a recorded violation.
- Data-start offsets 20/50/100, where input length permits: final states, differing-bar count, last mismatch, stable suffix. These are audit probes, never production parameters. Too-short datasets have no offset result, not evidence of convergence.
- MTF uses only observations available by each timestamp. Opposing HTF/LTF directions are `HTF_PULLBACK_CONTEXT`, agreement is `PRO_TREND_ALIGNMENT`, unknown direction is `UNCONFIRMED`. CC/CP/PC/PP examples include position and both directions.

Historical availability deliberately retains the existing completed/elapsed/followed-by-next-bar contract. The last candle and shortened session candles may be deferred; raw input is not claimed to have been fully analyzed. No H4/1H chronological pullback-onset claim or performance claim is generated automatically. Full valid-continuation eligibility and ambiguous lecture-pattern interpretation still need external case review. The tool never tunes thresholds or automatically recommends migration.

## Dataset / Structural Differences / Rule Violations

Actual dataset, symbols, period, counts, empirical differences and rule violations: **NOT_RUN**.

## Prefix Stability / Initialization Sensitivity

Real-data results: **NOT_RUN**. Synthetic harness tests are separate and do not establish real-data convergence.

## MTF Cases / Market Phase Cases

Actual pullback/alignment and CC/CP/PC/PP examples: **NOT_RUN**.

## Uncertain Rules

Initial seeding, OHLC intrabar ordering, exact invalid-pattern interpretation and arbitrary start-point convergence remain as documented in FALCON-STRUCTURE-V1.md. No new lecture rule is inferred from test outcomes.

## Production Migration Recommendation

**NOT READY — UNVERIFIED_REAL_DATA**. No production integration, main merge or baseline movement is authorized by this report.

## Harness verification

151 existing tests retained; 13 harness tests added; 164 passed, 0 failed. TypeScript PASS; Build PASS. Lint retains the same 22 baseline diagnostics, new errors 0. Example execution and no-input NOT_RUN output were checked separately. These are synthetic/tool checks only; REAL_DATA_VALIDATION remains NOT_RUN.

