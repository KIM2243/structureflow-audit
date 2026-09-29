# Falcon market-data export (development only)

This exports the existing Kiwoom chart result, not a new historical provider or trading feature. No UI/API/auth/engine changes are required.

## Commands

From repository root, using an existing local Kiwoom environment file (never commit it):

```sh
node --env-file=.env --experimental-strip-types scripts/export-falcon-market-data.mjs --symbol 005930 --days 60 --output data/falcon-validation/KR-005930.json
node --experimental-strip-types scripts/falcon-realdata-validate.mjs data/falcon-validation/KR-005930.json
```

For US, use `--symbol AAPL --market US --exchange ND`. If environment variables are already loaded, omit `--env-file=.env`. No credentials are accepted as CLI arguments. Existing output files are not overwritten.

The existing bridge configuration is preferred, exactly like `app/api/market/route.ts`: `KIWOOM_BRIDGE_URL` (or existing `CUSTOMER_HTTP_KIWOOM_BRIDGE`) plus `KIWOOM_BRIDGE_TOKEN`, with `/api/market` and `auto=1`. If not configured, the existing `getMarketChart(request, undefined, true, false)` implementation is used and requires `KIWOOM_MODE=real`, `APP_KEY`, `APP_SECRET`. Direct demo export is refused. Bridge deployment mode/version must be confirmed by its operator; the response alone does not certify provenance independently. No fallback provider is added.

## Exact data path

Production `getMarketChart` parses timestamps and applies existing sessions before export. The exporter never resamples, reparses timestamps, sorts, fills gaps or recalculates H4. Five-minute bars come from `chart.candles`; other series come from `chart.timeframes`. Optional 1D is retained when returned. Invalid or unsorted data fails instead of being silently changed. Requested calendar-day filtering is applied only after validating all returned data.

H4 is **derived**, using existing `toFourHourCandles`: group H1 candles by local session date, aggregate consecutive groups of up to four, and retain the final shorter group. Timezone is Asia/Seoul for KR and America/New_York for US; Candle dates retain their production ISO offsets. H4 provenance is written under `frameMetadata` (the actual harness contract), with `derived`, `derivedFrom`, and `aggregation`. Other current provider scopes are declared native. H4 cannot necessarily be reconstructed from the exported H1 tail: production aggregates up to 4,000 source H1 records before trimming each displayed frame to 800.

## Range limits

`--days 60` requests a 60-calendar-day window from the **existing available chart tail**, not a guaranteed 60-day historical download. The current implementation caps output at 800 candles per frame, page collection at 40 pages and 4,000 records; the exporter does not change these limits or add pagination. M1 will usually be much shorter than 60 days. Console coverage reports count/start/end/spanDays/requestedWindowCovered for every timeframe. Missing days are never fabricated. Very short requested windows that leave fewer than three bars or no common timeframe overlap fail input validation. The actual maximum available calendar range cannot be stated until authenticated data is received.

## Security and validation

Output is built by an explicit allowlist: symbol, fixed KIWOOM source, timezone, generated/captured timestamps, fixed frame provenance and six Candle fields only. Provider/session/header/credential/account objects are never spread into output. Raw provider errors are not echoed. Only data/coverage is printed. Input and artifacts directories are already gitignored. Default output is under `data/falcon-validation/`; custom output paths should remain untracked.

Mock tests verify stripping of sensitive fields, exact Candle copies and ordering, derived H4 metadata, missing/invalid data rejection, validator acceptance, bridge routing and direct M1/session options. No actual API is called in tests.

Real export has **not been performed** in this environment. No credentials or real market data were added. Falcon real-data validation remains NOT_RUN until an authenticated export is supplied and validated.
