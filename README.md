# StructureFlow

## Project Overview

StructureFlow는 OHLCV 기반 시장 구조 차트, 다중 시간대 거래 계획, 자동 모의매매, 동일 엔진 백테스트, 장 마감 후보 탐색 및 판단 기록 검토를 제공한다. 이 저장소는 **2026-09-28 구현 상태의 외부 감사용 사본**이다. 강의와의 동일성이나 수익성을 인증하지 않는다. 계산·UI·변수명·기능을 변경하지 않았다.

원본 기준 커밋: `08780d5f876a8c80a2991e89b41c8dffb1c0af15`. 공개 이력은 비밀번호 초기화 데이터만 제거하여 커밋 ID가 일부 달라진다. [공개 범위와 검증](docs/AUDIT-EXPORT.md), [파일 무결성 목록](docs/source-manifest.json), [이력 대응표](docs/history-map.json)를 함께 확인한다.

## Tech Stack

- TypeScript 5.9, React 19.2, vinext 1.0 beta / Vite 8 (Next 호환 app 라우팅)
- Tailwind CSS 4, Lucide, Base UI/shadcn
- Cloudflare Workers, D1(SQLite), R2; Drizzle ORM/schema/migrations
- 메인 가격 차트는 `app/page.tsx`의 SVG 기반 `PriceChart`; Recharts도 의존성에 포함
- Node.js >=22.13.0, Node test runner; Kiwoom REST bridge 및 예약 실행 스크립트

## Project Structure

| 경로 | 역할 |
|---|---|
| `app/page.tsx` | 페이지 상태, 분석 호출, PriceChart와 차트 오버레이, 화면 연결 |
| `app/api/` | 인증/관리자, 시장/시세, 후보, 모의계좌/기록/replay/review HTTP API |
| `components/` | 공통 계획·상위 맥락·단계 리본·재생·백테스트·후보·설명 UI |
| `lib/` | 구조·거래 계획·자동 엔진·공급자·저장 계층 및 `*.test.mjs` |
| `db/`, `drizzle/` | D1 스키마와 마이그레이션 |
| `scripts/` | Kiwoom bridge, 자동 모의매매/후보 runner, 설치/상태 검사 |
| `docs/` | 기존 설계 문서와 이번 감사 안내 |
| `hooks/`, `public/` | 반응형 hook와 정적 자산 |
| `.openai/hosting.json`, `vite.config.ts` | 기존 Sites 식별자 및 로컬 DB/FILES 바인딩 설정(인증 정보 아님) |

현재 소스에는 별도 `src/`, `utils/`, `services/` 디렉터리가 없다. 과거 인수인계의 `components/charts/PriceChart.tsx` 분리 설명 대신 **현재 실제 파일**을 기준으로 감사한다.

## Core Trading Logic

입력 `Candle`은 date/open/high/low/close/volume이다. 핵심 타입 `Pivot`, `StructureEvent`, `Analysis`, `StructureZone`, `LiquidityLevel`은 `lib/engine.ts`에서 확인할 수 있다.

| 기능 | 실제 파일 / 함수 | 입력 → 출력 / 화면 경로 |
|---|---|---|
| Swing Structure, Swing High/Low | `lib/market-structure.ts`: `mapMarketStructure` | Candle[] → StructureMap(pivots/events/trend/protectedLevel/weakLevel/range). `engine.analyze`와 snapshot → page/PriceChart |
| Internal Structure, 내부 고저점 | 같은 파일 `mechanicalInternalPivots` | Candle[] → 확인 시각을 가진 Pivot[]. `engine.detectStructureEvents` INTERNAL 이벤트와 연결 |
| BOS / CHoCH | `mapMarketStructure`; `lib/engine.ts`: `detectStructureEvents` | 가격과 pivot/구조 범위 → 방향·scope·시각을 가진 StructureEvent[]. Swing와 Internal 경로가 다르므로 둘 다 검사 |
| Type 1 / Type 2 | 전용 분류 함수/타입을 찾지 못함 | 강의 분류와 위 구조 알고리즘의 동등성은 미검증. 구현됐다고 간주하지 말 것 |
| Minor High / Low | `mechanicalInternalPivots` 관련 | 기계적 내부 pivot이 있으나 강의 Minor 정의와 독립적으로 일치 검증되지 않음 |
| Premium / Discount | `mapMarketStructure`의 range; `lib/swing-range.ts`: `getRecentSwingRange`; `engine.analyze` | 확인된 고저점/중간값 → 구간. 실제 PriceChart는 analysis.confirmedRange / mapMarketStructure.range 사용. getRecentSwingRange는 테스트 외 실행 호출 확인되지 않음 |
| Supply / Demand, OB/FVG | `lib/engine.ts`: 비공개 `detectZones`; `lib/auto-paper.ts`: `qualifiedZone`, `gradeZone` | OHLCV → 차트 StructureZone[] 또는 거래용 Zone/target/direction. 차트 휴리스틱과 실행용 구역 선정은 동일 함수가 아님 |
| Equal High/Low, Liquidity | `lib/engine.ts`: 비공개 `detectLiquidity` | 최근 pivot/ATR/봉 → LiquidityLevel[]. ATR 허용 오차 군집이며 정확히 같은 가격만을 뜻하지 않음. analyze → PriceChart |
| Sweep | `detectLiquidity` | 레벨 이후 wick 돌파와 종가 복귀로 SWEPT/BROKEN/UNTOUCHED 구분. 실제 주문 유동성을 관측한 결과가 아님 |
| Trendline / Range Liquidity | 전용 탐지기를 찾지 못함 | 수평 pivot 군집이나 일반 range 존재만으로 해당 개념 구현을 주장하지 않음 |
| Inducement | 전용 탐지기를 찾지 못함 | 설명 문구는 존재하지만 OHLCV로 유인/주문 축적을 확정하는 구현은 없음 |
| 1D/4H/1H/15m/5m/1m MTF | `lib/multi-timeframe.ts`: `evaluateMultiTimeframeEntry` | snapshots/analyses/candles/now/capital/entryFrame → 단계와 TradePlan. page → top-down/계획 UI |
| 공통 진입·손절·목표 | `lib/trade-plan.ts`: `composeTradePlan`; `lib/auto-paper.ts`: `upperStructurePlan`, `entryTerms` | 방향/관심·정제 구역/상위 위험/비용 → 가격 정합성·준비 상태. 관심구역 중심을 확정 진입으로 대신하지 않음 |
| 4H/1H 내부 CHoCH 맥락 | `lib/upper-context.ts`: `upperContext`, `confirmUpperContext` | 완료된 H4/H1 → UpperContext. H4 방향/H1 내부 방향과 H4 또는 H1의 내부 CHoCH 근거를 평가 → 공통 계획과 v4 자동 엔진 |
| CC/CP/PC/PP | `lib/market-phases.ts`: `classifyPhase`, `phaseStates`, `marketPhaseTimeline`, `phaseAt`, `marketPhaseSegments` | 4H/1H 구조 이벤트와 LONG/SHORT 관점 → PhaseTimeline/리본. `components/market-phase-layer.tsx`, `upper-context-details.tsx` 연결. TRANSITION은 분류 불가 가능 |
| HTF 차트 구역 | `lib/higher-context.ts`: `higherContexts` | 1D/4H Candle[] → HigherContext[] → `components/higher-context-overlay.tsx` |
| 자동 모의매매 | `lib/auto-paper.ts`: `newAutoState`, `advanceAuto`, `recordAutoDecision`, `autoEquity` | AutoState/AutoFeed/설정 → 상태·판단·모의 체결. `auto-paper-store.ts` → API → `auto-paper-panel.tsx` |
| 동일 엔진 백테스트 | `lib/auto-backtest.ts`: `historicalFeed`, `runAutoBacktest` | 과거 OHLCV/설정 → 동일 advanceAuto를 순차 호출 → `auto-backtest-panel.tsx` |
| 구형 백테스트 | `lib/engine.ts`: `backtest` | 별도 legacy 전략. 현재 자동 엔진과 동일하다고 해석하면 안 됨 |
| 판단 당시 재생 | `lib/decision-replay.ts`: `makeDecisionReplay`; `lib/auto-paper-store.ts`: `readDecisionReplay` | 판단/당시 feed → DecisionReplay; D1 메타/R2 봉 → API → `decision-replay.tsx` |
| 성급/누락/구역 차이 검토 | `lib/entry-review.ts`: `validateReview`, `reviewEvidence`, `zoneDifference` | 사용자 검토와 AutoDecision → 검토 근거/차이 → reviews API와 `entry-review-panel.tsx` |
| 강의 비교 사례 | `lib/lecture-cases.ts`, `components/lecture-casebook.tsx` | 비교용 사례집. 독립적으로 검증된 강의 전체 정답 데이터셋은 아님 |

### 중요한 추적 순서와 해석 제한

1. `app/api/market/route.ts` → `lib/kiwoom.ts`의 `getMarketChart` → Candle 시계열 → page의 분석 호출을 읽는다. `getCurrentPrice`는 시세 경로다. `scripts/kiwoom-bridge.mjs` 및 bridge/cache/gate 모듈은 연결/제한/캐시를 담당한다.
2. `lib/confirmed-bars.ts`의 완료봉 조건, `Pivot.confirmedAt`, 구조 이벤트 시각을 확인한 뒤 `analyze`/MTF를 읽는다. 종가 확인과 wick 기준, 진행 중 봉 및 미래 데이터 취급을 구분한다.
3. H4 방향/관심구역, H1 내부 흐름, 15m 상위 위험구역, 1m 또는 5m 정제를 연결한다. 모든 봉의 표시 방향이 같아야 한다는 뜻은 아니다.
4. `AUTO_VERSION` v4와 legacy v2/v3 분기를 분리한다. CC/CP/PC/PP 표시가 특정 코드 하나를 무조건 진입 조건으로 삼는다는 뜻은 아니다. 상위 CHoCH도 H4와 H1 모두를 동시에 요구하지 않는다.
5. UI 계획은 자동 계좌 체결 기록 자체가 아니다. 모의 체결 이후 보유 손절/목표와 새로 계산된 참고 계획을 따로 검토한다.
6. 거래량 프로파일은 OHLCV 대표가격 기반 24구간 집계다. 틱 체결별 volume-at-price가 아니다. 등급·ATR 여유·최소 순손익비·유효시간·비용은 사이트의 수치화 규칙으로, 강의 동일성은 별도 검증 대상이다.

`lib/yahoo-market.ts`도 원본에 존재하므로 보존했다. 현재 app/lib/scripts의 다른 파일에서 해당 모듈 import는 검색되지 않았다. 파일 존재를 활성 fallback의 증거로 간주하지 않는다.

## Records and Candidate Scanner

`db/schema.ts`, `drizzle/` 및 `lib/auto-paper-store.ts`에서 저장 모델과 CRUD를 확인한다. 실제 회원 DB, 세션, 개인 거래/판단 기록, R2 원본 데이터는 공개하지 않는다. 테스트 fixture와 저장/분석 코드는 포함한다. 실제 운영 재현에는 소유자가 별도로 비식별 데이터와 당시 설정을 제공해야 한다.

후보: `lib/scan-policy.mjs`, `scan-selection.mjs`, `scan-evaluate.ts`, `candidate-history.mjs`, `scripts/scan-runner.mjs`, 후보 API와 `components/candidates-panel.tsx`. 무료 서버 제한과 본장 마감 기준 탐색 정책도 이 경로에 있다.

## Running and Verification

Node >=22.13.0에서 `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run build`로 의존성/테스트/타입/빌드를 확인한다. 개발은 `npm run dev`, 빌드 후 로컬 Workers 실행은 `npm start`다. 실행 스크립트는 package.json을 기준으로 한다.

이 감사 작업에서 원본 snapshot의 **120개 테스트 통과**, **TypeScript 검사 통과**, **production build 완료**를 확인했다. 빌드는 vinext 정적 라우트 분류 한계를 안내한다. 이는 새 컴퓨터의 인증/실시간 공급자/DB까지 무설정으로 동작한다는 뜻은 아니다.

- `.env.example`은 변수 이름만 제공한다. 실제 키/토큰은 로컬의 무시된 환경 파일 또는 플랫폼 secret에 넣는다.
- D1 `DB`, R2 `FILES` 및 schema/migrations가 필요하다. 배포 manifest의 기존 프로젝트 ID는 감사 맥락용이며 다른 사용자의 배포 권한을 제공하지 않는다.
- 초기 관리자 생성 API는 기존 소유자 인증 헤더를 요구한다(`app/api/auth/setup/route.ts`). 보안을 우회하거나 실제 초기화 비밀번호를 공개하지 않았다. 독립 실행 환경의 인증/바인딩 준비가 필요하다.
- Kiwoom live bridge에는 별도 키·네트워크·공급자 권한이 필요하다. 서버 설치 절차는 `BRIDGE.md`, `docs/AUTO-PAPER.md`와 scripts를 참조한다. 이번 작업에서 운영 배포/서버 변경은 하지 않았다.
- 기존 설계 문서는 당시 설명일 수 있다. 현재 소스 및 테스트를 우선하고 강의 영상과의 일치 여부는 감사자가 판단한다.

## Audit Coverage and Remaining Evidence

시장 구조/BOS/CHoCH/P&D/구역/수평 유동성/sweep/MTF/시장단계는 구현 경로와 테스트를 추적할 수 있다. Type1/2, 전용 trendline/range liquidity, inducement는 독립 구현을 찾지 못한 항목이다. 원본 강의 영상/화면별 정답 라벨과 운영 당시 비식별 시세·결정 데이터는 이 저장소에 없다. 따라서 **코드 감사에는 사용할 수 있으나 강의 전체 충실도 인증을 이 저장소만으로 완료할 수는 없다**.

## Audit Baseline 준비

기능별 구현 상태와 실제 호출 흐름은 [AUDIT_MAP.md](AUDIT_MAP.md), 새 설치·lint를 포함한 검증 결과는 [AUDIT_VALIDATION.md](AUDIT_VALIDATION.md)를 참조한다. lint는 기존 소스의 22개 error 진단으로 실패했으며 이를 수정하지 않았다. `audit-baseline`은 감사 문서까지 포함한 최초 기준점으로 고정하고 이후 변경과 비교한다. 공급/수요, 유동성, Equal High/Low, Sweep, Minor 판정은 부분 구현으로 분류하며 Type1/2·Trendline/Range Liquidity·Inducement는 전용 계산 경로가 확인되지 않았다.

## Audit Baseline

- Tag: `audit-baseline`
- Commit: `88214a4a097c95cbfd66dbf5deeeb7ada1f017e5`
- Branch: `main`
- Created for: External code audit

[고정 기준점 보기](https://github.com/KIM2243/structureflow-audit/tree/audit-baseline)

이 SHA 기록은 태그 생성 후 추가한 문서 전용 변경이다. 기준점은 AUDIT_MAP.md와 AUDIT_VALIDATION.md를 포함하며, 이후 main이 변경돼도 audit-baseline은 이동하지 않는다.
