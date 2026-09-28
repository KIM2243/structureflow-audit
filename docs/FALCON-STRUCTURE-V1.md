# Falcon Structure v1 — parallel audit implementation

## Status and source of rules

This branch starts at `audit-baseline` (`88214a4a097c95cbfd66dbf5deeeb7ada1f017e5`). It does not move that tag, merge main, deploy, or change production entry gates. The normative inputs for this implementation are the user's written Falcon specification and subsequent seeding/same-bar clarification in this task. No claim is made that the videos were independently re-watched or that these synthetic cases certify every lecture example.

`lib/falcon-structure.ts` (Swing), `lib/falcon-internal.ts` (Internal) and `lib/falcon-shadow.ts` (test/development comparison) are separate from legacy. Existing `mapMarketStructure`, `mechanicalInternalPivots`, `detectStructureEvents`, `analyze`, `multi-timeframe`, `upper-context`, `market-phases`, `auto-paper`, backtest and replay files remain byte-identical to baseline.

## Rules implemented in the parallel engine

1. **Swing Type 1**: wick-derived level, strict completed close outside level. Equality and an incomplete close do not qualify. A wick-only failed break does not raise the threshold of an already confirmed level.
2. **Swing reversal**: opposite protected strong point close break switches direction on that event, without waiting for another BOS. Legacy TRANSITION behavior is deliberately retained only in the unchanged legacy implementation.
3. **Swing origin confirmation**: a distinct pullback candle supplies the origin. It becomes a protected point only on structural close continuation; a mere bounce is not enough. Strong and weak seed anchors cannot share a candle. Weak is the current attack extreme; this is not a license to treat every current extreme as a historical confirmed pivot.
4. **Internal Type 2**: separate state machine. A confirmed opposite Minor is tested with high/low, not close; prior direction must exist before CHOCH is emitted. Subsequent same-direction extension is not repeated CHOCH.
5. **Candidate/Confirmed**: candidate carries pivotIndex/detectedAt; only a later leg extreme extension promotes it with confirmedAt. The candidate is never passed to the CHOCH predicate. Direction/active leg/current extreme/pullback/candidate/confirmed high-low are separately exposed.
6. **Same-bar protection**: previously confirmed Minor remains eligible on this bar, including when the old leg also extends. A point newly promoted on this bar is ineligible until a later bar. Ambiguities are recorded in internal debug state, not DB/API.
7. **Independent structure**: Internal CHOCH does not change Swing trend. The same candles can produce opposite states legitimately.
8. **CC/CP/PC/PP**: `classifyPhase` is unchanged; tests cover all eight direction combinations. Shadow classification uses the new H4 Swing/H1 Internal values. This is not a replacement of the production phase timeline.

## Time and no-look-ahead contract

`pivotIndex` is the price location, `confirmedAt` is the bar where knowledge becomes available, `eventIndex` is the break bar, `observedAt` is the actual availability timestamp supplied by the observation contract. A retrospective drawing at pivotIndex does not imply the point was known then. Engines process observations in order and do not scan future candles.

Historical shadow conversion uses the existing `closedBars` contract: only elapsed bars followed by another bar are included. Each OHLC is available at nominal bar close, never its open. The last bar and shortened final-session H4 bar can therefore be deferred conservatively. Future OHLC poisoning must not alter earlier results.

A live caller can supply an incomplete observed candle to Internal: a known Minor wick break need not wait for close. Swing ignores incomplete observations. No live adapter is connected in v1. These functions accept ordered snapshots, not an intrabar tick store. Same-candle update sequencing, provider corrections and live-to-history reconciliation have not been proven. Lower-timeframe intrabar reconstruction is intentionally not implemented.

## UNCERTAIN_RULE 1 — Initial Swing / Internal seeding

The lecture's exact data-start bootstrap algorithm is not established by the supplied specification. Both unseeded engines return TRANSITION initially; no first-two-candle direction alone becomes a confirmed trend.

**StructureFlow implementation choice**: an exclusive directional extreme extension establishes only a tentative active leg. A distinct extension-failure candle starts a pullback candidate. A later close through the prior extreme (Swing), or wick extreme extension confirming a Minor (Internal), establishes the initial direction. It is recorded as initialDirection, not CHOCH. Explicit known seeds are supported for isolated rule tests and resumed context; they are not inferred from future pivots.

This tentative leg is conservative and can remain unconfirmed for a long time. Different data-start points may produce different initialization and later states. Sensitivity is exposed rather than hidden; general seed-invariance is NOT established. Production adoption remains deferred pending representative examples and warm-up policy review.

## UNCERTAIN_RULE 2 — Same-bar intrabar ordering

OHLC does not reveal high/low ordering. **StructureFlow implementation choice**: a Minor confirmed on a candle cannot be broken by that same candle for CHOCH purposes. The pre-existing candidate can be confirmed while sameBarAmbiguous is recorded; CHOCH waits for a later bar. A point confirmed on an earlier bar is still eligible immediately on observed wick break. No sub-timeframe reconstruction is attempted.

## Other implementation boundaries

**StructureFlow implementation choice**: the candidate wick window starts at the extension-failure bar and ends before the confirmation bar. It accumulates the opposite wick extreme of those pullback bars. Whether an exact lecture example includes the preceding extreme candle needs visual reference confirmation. Same-bar reversal of an already confirmed level takes priority over old-leg continuation; the bar's observed opposite extreme initializes the new leg, without a second same-bar CHOCH.

Mechanical invalid pattern enforcement is limited to separate origin/attack candles and a real intervening failure-to-extend phase. No ATR threshold or arbitrary candle-count filter is invented. **UNCERTAIN_RULE**: 'effectively the same movement' and every lecture invalid-pattern variant lack exact definitions; full exclusion of those variants is not claimed.

## Shadow comparison and production safety

`compareFalconStructure` / `falconDifferential` return bar/date, legacy and Falcon Swing/Internal directions and events, protected/weak points and confirmed Minors. `falconMtfShadow` evaluates H4 Swing and H1/15m/1m-or-5m Internal/CHoCH context in a test harness. Its structuralCandidate flag is an illustrative structural comparison, **not an executable trade plan**: it omits the unchanged zone/touch/grade/fee/risk execution gates.

No production module imports the new engine. No double signals, additional live CPU work, DB writes or new automatic trades are introduced. No historical Falcon trading-performance result is claimed: the production advanceAuto backtest and decision-replay tests remain regression checks of the unchanged engine. Real captured historical decision/feed comparisons are still required before switching.

## Explicitly deferred

- Production MTF/auto-paper/UI switching and live observation adapter.
- Full invalid-pattern equivalence and general data-start convergence.
- Exact Falcon Supply/Demand, Inducement, Sweep Zone, Trendline/Range Liquidity, Momentum quality, V-shaped filters, new entry/risk models and Volume Profile.
- Tick-level historical ordering and empirical profitability.

## Review checkpoints

The parallel engines must satisfy strict close/wick distinction, confirmed-only CHOCH, first-opposite Swing reversal, same-bar deferral, prefix stability, initial TRANSITION and phase matrix tests. Existing 120 tests are preserved. Per-stage tests/type/build are recorded before advancing; baseline lint failures must remain unchanged. See the verification appendix added with final results.

## Verification appendix (2026-09-28)

- Baseline: 120 existing tests. Final: 148 passed, 0 failed (28 added, including fixture contract).
- Stages: fixture 121; Swing 128; Internal 139; historical/MTF 146; final hardening 148. Each stage passed full tests, installed TypeScript `tsc --noEmit` and `npm run build` before its commit/next stage.
- Final lint: baseline 22 errors, final 22, new error diagnostics 0; compared sorted file/rule/message records, not only counts. Existing errors not fixed.
- Synthetic differential: 8 bars, 2 bars with differing Swing/Internal direction; detailed events available via `node --experimental-strip-types scripts/falcon-compare.mjs`.
- Existing `auto-paper.test.mjs`, `auto-backtest.test.mjs`, `decision-replay.test.mjs` all included and passed. No live captured-market Falcon backtest/replay dataset was supplied; no claim of empirical equivalence or increased trade quality.
- No runtime imports from existing modules to Falcon files. Existing production logic remains byte-identical; no gate/amount/risk/DB/API/auth/Kiwoom/UI change.
- No main merge or deployment. audit-baseline remains `88214a4a097c95cbfd66dbf5deeeb7ada1f017e5`.

## Final review answers

1. Parallel Swing: wick level + completed close; yes in tested cases.
2. Parallel Internal: only previously confirmed Minor wick break; yes.
3. Candidate used as CHOCH target: no in new engine; old mechanical path remains in production, unchanged intentionally.
4. Additional BOS after opposite Swing: not required in new engine; legacy TRANSITION path remains intentionally.
5. Production lower-timeframe Swing-bias timing: still present, because the user explicitly deferred switching pending external review.
6. Tested historical prefixes and future poisoning: no premature events found. Live mutable-bar reconciliation and arbitrary bootstrap invariance remain unproven.
7. Existing 120 tests: no unintended regression detected.
8. Production availability: no runtime path changed and build/regressions pass; deployed service was not modified or newly live-tested in this task.

This completes the parallel implementation/testing stage, NOT production migration or full lecture conformance certification.

## Internal event metadata clarification

Internal currentExtreme retains its own FalconPoint metadata. Explicit seeds preserve their supplied confirmation/observation times, even when confirmation follows the price bar. Newly observed leg extremes become known when that observation establishes or extends the leg (confirmedAt = observation.index, observedAt = observation.observedAt); this denotes knowledge of the active extreme, not Minor confirmation or a confirmed trend. BOS copies pivotIndex and confirmedAt from the broken extreme before replacing it. CHOCH copies them from its confirmed Minor target. Candidate detectedAt remains the first discovery of the pullback, independent of candidate revisions and target knowledge. Minor confirmation still occurs only on the existing extension condition. Event observedAt is the break observation time, with target observedAt <= event observedAt and pivotIndex <= confirmedAt <= eventIndex. No structural predicates or production paths change.
