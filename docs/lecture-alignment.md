> 현재 새 실험 규칙은 [상위 계획 기반 v3](AUTO-PAPER-V3.md)를 참고하세요. 아래는 이전 구현과 강의 대조 기록입니다.

# Lecture alignment — 2026-09-09

## Evidence boundary

The preceding review sampled major chart scenes in Falcon ZERO TO HERO 6-1
through 6-10 (BujILvSVkyY, gdLHAeayW0c, jpBKDicJ-V8, A8371GwrlYs,
D5H_zSVLumU, to7R33gHAh8, QQ_xvnhJVXk, rjX7AhY4F80, h5w-35Y9Yhs,
ZQbf_ezRj4E). It was not a complete audiovisual transcription or verification
of every exception. This release implements a documented conservative
interpretation, not a certified reproduction of the lecturer's full strategy.

## Shared implementation

Dashboard and paper charts both use `analyze` and the same sequential map.
Quotes, authentication, user watchlists, and bridge configuration are unchanged.

- Seed with first two bars. This initialization is an application convention;
  loading a different history start can change the initial map.
- Wick prices define levels; only closes break them. No aggressive wick mode.
- The completed swing extreme freezes when the first bar fails to extend it.
  Internal retracements do not replace the protected origin.
- A continuation break promotes the deepest intervening pullback origin.
- A protected-level closing breach is CHoCH/TRANSITION, not immediate confirmed
  reversal. The next continuation BOS confirms the new direction.
- Single-candle extension failures define internal candidates independently.
  They become available on the next bar and are used only after confirmation.
- Last supplied bar is conservatively treated as potentially unfinished and
  excluded from structure confirmation (also at market close, one-bar delay).
- P/D uses protected level + confirmed extreme midpoint. No range is fabricated
  during an unconfirmed extension. Chart viewport changes do not select a new
  local pair for the current plan.

## Application choices, not quoted lecture rules

- Entry zone: BOS-origin candle wick-to-body, clipped to the favourable half.
- Stop: outside origin, with max(0.1 ATR, 0.001% current price) buffer.
- Target: opposing weak extreme; minimum 2R. No ATR-generated distant target.
- 4H direction, 15m price plan, 5m reaction. 1D/1H are context only.
- A ready combined signal requires a valid 15m plan, current price in zone,
  >=2R, aligned 5m structure, and a recent completed internal break strictly
  after the completed 15m zone-touch timestamp. Missing times fail closed.
- Reaction recency is three completed 5m bars. Lecture 1m execution is NOT
  synthesized from 5m; this is an explicitly labelled alternative.
- Checklist score is not a statistical win probability.
- VP is an OHLCV typical-price histogram, not true volume-at-price/order flow.
  OB/FVG overlays remain supplemental heuristics, not the structural entry zone.
- Liquidity clusters are candidates. First subsequent crossing with close back
  inside is a sweep candidate; outside close is broken. No institutional intent
  or inducement is inferred as a fact.

## Deliberately not represented as complete

The existing lookback + MA + ATR backtest remains a separate, clearly labelled
strategy. It does NOT validate this multi-timeframe setup. Proper comparative
performance work requires synchronized historical datasets for each timeframe,
next-bar fills, sessions, costs and out-of-sample evaluation. No performance
claims are made by this release. Optional aggressive wick confirmation and
lecture-exact one-minute execution are not implemented.

## Regression checks

Synthetic tests cover internal-vs-protected lows, wick-only crosses, reversal
confirmation, prefix-stable events, confirmed ranges, bar confirmation timing,
currency scale invariance, fixed 15m plan, missing zone contact and timestamps,
and reactions preceding contact. Existing API tests are mocked regression
checks, not a claim of a live broker integration test in this release.
