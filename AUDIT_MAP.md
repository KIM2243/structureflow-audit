# StructureFlow Audit Map

## Audit Baseline

- Tag: `audit-baseline`
- Branch: `main`
- Created for: External code audit
- 태그 대상의 정확한 SHA: `git rev-parse audit-baseline^{commit}`로 확인한다. 이 문서를 포함한 기준 커밋을 생성한 뒤 태그를 고정하며, main의 후속 문서 커밋에 실제 SHA를 기록한다. 커밋은 자기 자신의 hash를 내용에 포함할 수 없으므로 이 두 단계를 구분한다.
- 조사 출발점: `c1ad44bb26fc4ef2b4f17942a119da0a8cf41400` (기존 공개 사본).

## 판정 범위

**구현됨**은 해당 계산 경로가 존재한다는 뜻이며 Falcon 강의와의 동일성 인증이 아니다. **부분 구현**은 관련 계산은 있으나 이름이 포괄하는 전체 범위를 담당하지 않는 경우다. **관련 로직 확인되지 않음**은 전용 계산 함수·타입·호출 경로를 조사에서 찾지 못했다는 뜻이다. 강의 판정용 정답 데이터가 없는 상태에서 미구현을 추정해 새 코드를 작성하지 않았다.

아래 경로는 저장소 root 기준이다. private 함수도 실제 이름으로 적었다. UI Consumer가 없는 경우 억지로 연결하지 않았다.

| Feature | Status | Source File | Function / Symbol | Input | Output | Called By | UI Consumer |
|---|---|---|---|---|---|---|---|
| Swing Structure | 구현됨 | lib/market-structure.ts | mapMarketStructure; StructureMap | readonly Candle[] | pivots, events, trend, protectedLevel, weakLevel, range | engine.ts snapshot/analyze; auto-paper.ts qualifiedZone; upper-context.ts frameContext; market-phases.ts marketPhaseTimeline | app/page.tsx PriceChart, 시간대 구조/계획 |
| Swing High / Low | 구현됨 | lib/market-structure.ts | mapMarketStructure | 봉의 high/low/close와 순차 상태 | 확인된 Pivot[]와 보호/약한 수준 | 위와 동일 | PriceChart 구조 pivot |
| Internal Structure | 구현됨 | lib/market-structure.ts; lib/engine.ts | mechanicalInternalPivots; detectStructureEvents(scope=INTERNAL) | Candle[] → 내부 Pivot[] | HH/LH/HL/LL 및 내부 이벤트 | engine.ts analyze; upper-context.ts frameContext; market-phases.ts marketPhaseTimeline | PriceChart 내부 구조/용어 설명 |
| BOS | 구현됨 | lib/market-structure.ts; lib/engine.ts | mapMarketStructure; detectStructureEvents | OHLC/pivot/구조 상태 | StructureEvent(kind=BOS, direction, scope, index, price) | snapshot/analyze 및 상위 맥락 계산 | PriceChart, 시간대 구조 |
| CHoCH | 구현됨 | 위와 동일; lib/upper-context.ts | mapMarketStructure; detectStructureEvents; confirmUpperContext | 보호 수준 이탈/내부 pivot, H4/H1 상태 | CHOCH 이벤트, 상위 confirmed/reason | upperContext → evaluateMultiTimeframeEntry/advanceAuto | PriceChart; components/upper-context-details.tsx; 공통 계획 |
| Type 1 / Type 2 | 관련 로직 확인되지 않음 | 전용 파일 없음 | 전용 분류 symbol 없음 | — | — | — | 명시적인 판정 결과 연결 없음 |
| Minor High / Low | 부분 구현 | lib/market-structure.ts | mechanicalInternalPivots | 순차 Candle[] | 기계적 내부 Pivot[] | detectStructureEvents | 내부 구조 표시. 강의 Minor 전용 분류와 동일함은 검증되지 않음 |
| Premium / Discount | 구현됨 | lib/market-structure.ts; lib/swing-range.ts; lib/engine.ts | mapMarketStructure.range; getRecentSwingRange; analyze | 확인된 high/low 또는 반대 pivot 쌍 | high/low/equilibrium 및 분석 구간 | analyze → analysis.confirmedRange; getRecentSwingRange는 테스트 외 실행 호출 확인되지 않음 | PriceChart dealingRange → P/D SVG; helper는 직접 UI 연결 없음 |
| Supply / Demand | 부분 구현 | lib/engine.ts; lib/auto-paper.ts | detectZones(private); qualifiedZone; shiftedZone; gradeZone | Candle[]/방향/프레임/구역 | OB/FVG StructureZone[] 또는 실행용 Zone/등급/target | analyze; evaluateMultiTimeframeEntry; advanceAuto | PriceChart 구역, 등급, 공통 계획. 강의의 모든 구역 유형을 인증하지 않음 |
| Liquidity | 부분 구현 | lib/engine.ts | detectLiquidity(private); LiquidityLevel | 내부 pivots, ATR, completed candles | BUY_SIDE/SELL_SIDE 수평 군집과 touches/status | analyze | PriceChart 유동성 표시 |
| Equal High / Low | 부분 구현 | lib/engine.ts | detectLiquidity | 최근 최대 50 pivot, ATR 허용오차 | 근접 가격 군집, 최대 6수준 | analyze | PriceChart. 정확한 동일가격 또는 강의 전 유형의 equal 판정이 아님 |
| Trendline Liquidity | 관련 로직 확인되지 않음 | 전용 탐지기 없음 | 없음 | — | — | — | 일반 구조 연결선을 해당 탐지 결과로 해석하지 말 것 |
| Range Liquidity | 관련 로직 확인되지 않음 | 전용 탐지기 없음 | 없음 | — | — | — | P/D range와 수평 군집을 별도의 Range Liquidity 판정으로 간주하지 말 것 |
| Inducement | 관련 로직 확인되지 않음 | app/page.tsx, docs/lecture-alignment.md는 설명만 | 전용 계산 없음 | — | — | — | OHLCV로 유인/주문 누적을 확정하지 않는다는 안내만 존재 |
| Sweep | 부분 구현 | lib/engine.ts | detectLiquidity | 수평 군집 이후 첫 wick 이탈/종가 | SWEPT/BROKEN/UNTOUCHED | analyze | PriceChart. OHLCV 후보 분류이며 실제 주문 소진 관측 아님 |
| Multi-Timeframe | 구현됨 | lib/multi-timeframe.ts; lib/trade-plan.ts | evaluateMultiTimeframeEntry; composeTradePlan | snapshots, analyses, candles, now, capital, entryFrame | 단계/상태/riskPlan/TradePlan | app/page.tsx; lib/scan-evaluate.ts | components/top-down-panel.tsx 및 공통 계획/PriceChart |
| 4H / 1H / 15m / 5m / 1m | 구현됨 | lib/kiwoom.ts; lib/confirmed-bars.ts; lib/multi-timeframe.ts | getMarketChart; toFourHourCandles; closedBars; evaluateMultiTimeframeEntry | 공급자 분/일봉, now | 프레임별 봉 및 완료봉/공통 거래 계획 | market API 또는 bridge; page/자동 엔진 | 시간대 전환, 공통 계획. H4는 H1 집계 경로 |
| CC / CP / PC / PP | 구현됨 | lib/market-phases.ts | classifyPhase; phaseStates; marketPhaseTimeline; phaseAt; marketPhaseSegments | H4 swing, H4/H1 internal events, LONG/SHORT 관점 | PhaseTimeline/Phase/리본 구간 | page useMemo; upper-context.ts upperContext | components/market-phase-layer.tsx, upper-context-details.tsx / PriceChart |
| 거래 기록 / 분석 데이터 | 구현됨(저장·조회 코드) | lib/auto-paper.ts; auto-paper-store.ts; decision-replay.ts; entry-review-store.ts; db/schema.ts | recordAutoDecision; runAutoTick; makeDecisionReplay; readDecisionReplay | AutoFeed/AutoState/사용자 검토 | AutoDecision/모의체결/DecisionReplay/DB 레코드 | app/api/paper/auto 및 reviews; scripts/auto-paper-runner.mjs | auto-paper-panel/decision-replay/entry-review-panel. 실제 운영 데이터는 비공개 |
| 차트 구조/구역/유동성 계산 | 구현됨 | lib/engine.ts; lib/higher-context.ts; app/page.tsx | analyze; higherContexts; PriceChart | 선택 프레임 OHLCV, 상위 봉, 공통 계획 | Analysis/HigherContext[]/SVG | page useMemo → PriceChart props | PriceChart 및 higher-context-overlay/market-phase-layer |

## 실제 데이터 흐름

이 프로젝트는 요청의 개념 목록을 하나의 직렬 파이프라인으로 계산하지 않는다. **차트 분석, 공통 계획, 시장단계, 자동 계좌**가 공통 모듈 일부를 사용하는 별도 경로다.

1. **공급자/서버 경계**: `app/api/market/route.ts:GET`에서 사용자 인증 후 bridge가 설정되면 `lib/bridge.ts:fetchFromKiwoomBridge`로 전달한다. 그렇지 않으면 `lib/kiwoom.ts:getMarketChart`를 직접 호출한다. bridge 오류 시 다른 공급자 가격으로 대체하지 않고 오류를 반환한다. bridge의 서버 진입점은 `scripts/kiwoom-bridge.mjs`이다.
2. **원시 데이터 정규화/집계**: `lib/kiwoom.ts:parseChartRows`가 공급자 응답을 Candle 형태로 바꾸고 날짜/시간을 해석한다. `aggregateCandles`/`toFourHourCandles`는 세션별 H1을 H4로 집계한다. `getMarketChart`가 timeframes를 반환한다. `lib/engine.ts:resample`은 별도 일반 집계 helper이며 공급자 H4 경로와 혼동하면 안 된다.
3. **클라이언트 상태**: `app/page.tsx`에서 `/api/market` 응답을 받아 `setData(payload.candles)`와 `setHigherTimeframeData(payload.timeframes || {})`로 저장한다. `timeframeData`에서 선택한 `chartData`와 프레임별 snapshot/entryAnalyses를 useMemo로 계산한다. CSV/demo 경로도 존재하므로 화면 데이터 출처를 함께 확인한다.
4. **구조 계산**: `structureSnapshot` → `mapMarketStructure`(swing)이고, `analyze`는 swing 외에도 `mechanicalInternalPivots` → `detectStructureEvents`(internal)을 계산한다. `StructureEvent`와 `Pivot`은 `lib/engine.ts` 타입이다. `confirmedAt`, 완료봉 제한, 종가 돌파와 wick 수준은 서로 다른 시점/가격 개념이다.
5. **병렬 분석 파생**: `analyze`는 구조 상태 외에 구역 `detectZones`, 내부 pivot 기반 수평 유동성 `detectLiquidity`, 가격구간/거래량 보조값을 산출한다. Liquidity가 MTF의 필수 선행 조건이라는 단일 연결은 없다. `detectLiquidity`에는 마지막 미완성 봉을 제외한 completed가 전달되지만 `detectZones`의 호출 인자는 data다. 계산마다 입력 범위를 감사해야 한다.
6. **공통 거래 계획**: page의 snapshots/entryAnalyses/candles → `evaluateMultiTimeframeEntry` → H4 `qualifiedZone`, 하위 `shiftedZone`, `upperContext`, 등급·비용·가격 순서 검사 → `composeTradePlan`. 결과 `multiTimeframeEntry.tradePlan`은 `commonPlan`으로 전달된다. 작은 봉을 선택해도 거래 방향/상위 손절 목표와 화면 관찰 프레임은 별개다.
7. **시장단계**: `marketPhaseTimeline(timeframeData, commonPlan.asOf)`는 H4 swing 및 H4/H1 내부 이벤트로 별도 타임라인을 만든다. `classifyPhase`는 포지션 관점에 상대적인 코드다. 상위 `confirmUpperContext`의 진입 확인과 리본 코드 자체는 같은 게이트가 아니다. 동시 이벤트 우선순위 등은 명시된 구현 선택이다.
8. **표시**: page의 `PriceChart`에 analysis/상위 구역/공통 계획/단계가 props로 전달되어 SVG와 설명 UI에 그려진다. `higherContexts`는 HTF 구역, `market-phase-layer`는 리본을 담당한다. 모든 표시가 자동 계좌의 실제 체결은 아니다.
9. **서버 기록 경로**: `auto-paper-store.ts:runAutoTick` → `advanceAuto` → 상태/판단/모의체결을 D1에 저장하며 재생 봉은 R2 경로를 사용한다. API를 통해 계좌/재생 UI가 조회한다. 클라이언트 useState만이 거래 기록의 저장소는 아니다.
10. **백테스트 구분**: `auto-backtest.ts:runAutoBacktest`는 `historicalFeed`로 시점을 잘라 동일 `advanceAuto`를 호출한다. `engine.ts:backtest`는 별도 legacy 계산이다. 두 결과를 같은 전략의 증거로 섞지 않는다.

## 검증 및 미확정 범위

실행 검증, 이력 secret 점검, 실행 코드 무변경 비교는 [AUDIT_VALIDATION.md](AUDIT_VALIDATION.md)에 기록한다. 강의 원본의 사례별 정답, 실제 시세 원본/계정 데이터, 공급자 연결 권한은 포함하지 않는다. 기존 테스트 통과는 모든 강의 규칙의 일치를 입증하지 않는다.

후속 변경 비교: `git diff audit-baseline..main -- app components lib scripts db drizzle` 및 `git log audit-baseline..main`을 사용한다. 태그는 이동하지 않는다.

### 재검사에서 바로잡은 연결

`getRecentSwingRange`는 함수/테스트가 존재하지만 현재 실행 UI 호출은 확인되지 않았다. 실제 P/D는 `PriceChart`의 dealingRange가 `analysis.confirmedRange` 또는 과거 viewport의 `mapMarketStructure(...).range`를 사용한다. `structureSnapshot`은 swing 요약이며 internal 계산은 `analyze` 등 별도 호출 경로다. `engine.analyze` 내 snapshots는 고정 개수 resample을 사용하므로 공급자 native timeframes와 혼동하지 않아야 한다.

## 고정된 Audit Baseline SHA

- Tag: `audit-baseline`
- Commit: `88214a4a097c95cbfd66dbf5deeeb7ada1f017e5`
- Branch: `main`
- Created for: External code audit

위 SHA는 실제 `git rev-parse audit-baseline` 결과이다. 태그 생성 후 main 문서에만 기록했으며 기준점의 계산 코드와 문서를 다시 쓰지 않았다.
