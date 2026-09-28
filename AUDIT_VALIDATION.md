# Audit Validation — 2026-09-28

검사 대상: 기존 공개 HEAD `c1ad44bb26fc4ef2b4f17942a119da0a8cf41400`의 실행 코드. 이번 변경은 AUDIT_MAP.md, AUDIT_VALIDATION.md, README.md 문서만 허용한다. 원본 개발 저장소는 수정하지 않는다.

## 실행 검증

환경: Windows, Node v24.13.1, npm 11.8.0. 명령은 감사 사본 root에서 실행했다. 의존성/생성물은 Git에서 제외한다.

| 검사 | 실제 실행 명령 | 결과 | 해석 / 감사 영향 |
|---|---|---|---|
| Install | npm.cmd ci --no-audit --no-fund | 성공, 566 packages | lock 기반 새 설치. deprecated core-utils 경고. 보안 취약점 전수 audit 실행을 의미하지 않음 |
| Typecheck | node node_modules/typescript/bin/tsc --noEmit | 성공, exit 0 | package.json에 typecheck script는 없음. 이미 의존성에 있는 실제 TypeScript compiler를 직접 실행했으며 script를 추가하지 않음 |
| Lint | npm.cmd run lint | 실패, exit 1, 22개 error 진단 | 기존 소스의 정적 품질 문제. 환경변수 누락 때문이 아님. 수정하지 않음 |
| Tests | npm.cmd test | 성공, 120 passed / 0 failed | 기존 Node 테스트. 강의 전체 정답 검증이나 실거래 검증 아님 |
| Production build | npm.cmd run build | 성공, exit 0 | vinext 일부 route 분류 미지원 안내. live 공급자/인증/운영 DB 검증은 별도 |

lint는 unused import, React effect 내 setState, render 시 Date.now, Hook dependency, GET body 테스트 fixture, 타입의 기본 문자열 변환 문제를 보고했다. 빌드가 된다는 사실을 lint 통과로 표현하지 않는다. 아래 진단은 자동 수정 없이 보존한다.

## Secret 재검사

공개 사본의 모든 refs에서 도달 가능한 87 commits / 360 trees / 479 blobs(926 objects)를 검사했다. `.env`와 개인 키/인증서 경로, private key/certificate PEM, GitHub/AWS token, credential 포함 DB URL, service-account, JWT 패턴에서 일치 항목이 없었다. 이전 비밀번호 초기화 SQL의 credential 값 4개도 모든 공개 객체에서 일치 0이었다. 앞선 이력 대입/SQL 검사의 후보는 매개변수화 SQL 및 synthetic test 값임을 확인했다. 추가 문서는 정적 설명만 포함하며 작업 트리 역시 비밀 환경파일 없이 조사했다.

이는 패턴 기반 검사 및 발견 후보 검토 결과이며 알 수 없는 모든 secret을 수학적으로 배제하는 보증은 아니다. 새 실제 secret은 발견되지 않았고 이번 작업에서 이력을 rewrite하지 않았다. 이전 공개 준비 단계의 password-reset stub과 대응표는 그대로 보존했다. 개발용 node_modules와 build 출력은 검사/공개 대상 소스가 아니며 업로드하지 않는다.

## 변경 검증

출발 commit과 비교하여 app/, components/, lib/, scripts/, db/, drizzle/, hooks/, public/, package.json, package-lock.json, tsconfig.json, vite/next 설정, 타입, 기존 문서 외 실행 파일의 Git blob 일치를 확인한다. 이번 작업에 허용한 변경은 README.md, AUDIT_MAP.md, AUDIT_VALIDATION.md뿐이다. 코드·DB·API·UI·알고리즘·타입 변경은 0이다. lint 문제도 되돌리거나 수정하지 않았다.

## 감사 기준점과 한계

태그가 없다면 감사 문서 커밋을 만든 후 `audit-baseline` 태그를 생성한다. 태그 생성 전 local/remote에 같은 이름이 없음을 확인했다. 이후 실제 tag commit SHA를 main의 문서 전용 커밋에 기록한다. 이 후속 문서는 기준점의 실행 코드를 바꾸지 않는다. 태그의 SHA가 필요하면 `git rev-parse audit-baseline^{commit}`를 사용한다.

원본 강의/라벨 정답, private 운영 DB/R2 자료, API keys, 소유자 인증 헤더 등은 없다. 독립 실행의 인증/공급자 준비와 강의 충실도 판단은 남는다. 구현 여부 표는 소스 존재성의 판정으로 제한된다.

## Lint 진단 위치
- lib/multi-timeframe.ts:4:50: error eslint(no-unused-vars): Identifier 'internalDirection' is imported but never used.
- lib/auto-backtest.ts:2:14: error eslint(no-unused-vars): Type 'Candle' is imported but never used.
- components/candidates-panel.tsx:12:48: error react(react-compiler): EffectSetState: Calling setState synchronously within an effect can trigger cascading renders
- components/candidates-panel.tsx:21:48: error react(react-compiler): EffectSetState: Calling setState synchronously within an effect can trigger cascading renders
- components/decision-replay.tsx:8:57: error react(react-compiler): EffectSetState: Calling setState synchronously within an effect can trigger cascading renders
- components/decision-replay.tsx:13:41: error react(react-compiler): EffectSetState: Calling setState synchronously within an effect can trigger cascading renders
- components/auto-paper-panel.tsx:31:41: error react(react-compiler): EffectSetState: Calling setState synchronously within an effect can trigger cascading renders
- components/auto-paper-panel.tsx:50:118: error react(react-compiler): Purity: Cannot call impure function during render
- components/auto-paper-panel.tsx:50:369: error react(react-compiler): Purity: Cannot call impure function during render
- components/auto-paper-panel.tsx:55:243: error react(react-compiler): Purity: Cannot call impure function during render
- lib/admin-users.test.mjs:17:75: error unicorn(no-invalid-fetch-options): "body" is not allowed when method is "GET"
- app/page.tsx:1298:88: error react(react-compiler): Purity: Cannot call impure function during render
- app/page.tsx:3095:64: error react(react-compiler): MemoDependencies: Found extra memoization dependencies
- app/page.tsx:3095:5: error react-hooks(exhaustive-deps): React Hook useMemo has unnecessary dependency: liveUpdatedAt
- app/page.tsx:3244:99: error react-hooks(exhaustive-deps): React Hook useEffect has a missing dependency: 'current'
- app/api/paper/auto/route.ts:14:46: error typescript(no-base-to-string): 'body.symbol||''' will use Object's default stringification format ('[object Object]') when stringified.
- app/api/paper/auto/route.ts:15:153: error typescript(no-base-to-string): 'exchange' will use Object's default stringification format ('[object Object]') when stringified.
- app/api/paper/auto/route.ts:16:72: error typescript(no-base-to-string): 'body.entryTimeframe' may use Object's default stringification format ('[object Object]') when stringified.
- components/auto-paper-panel.tsx:63:237: error typescript(no-base-to-string): 'label' may use Object's default stringification format ('[object Object]') when stringified.
- components/auto-paper-panel.tsx:63:262: error typescript(no-base-to-string): 'label' may use Object's default stringification format ('[object Object]') when stringified.
- components/auto-paper-panel.tsx:77:319: error typescript(no-base-to-string): 'frame' may use Object's default stringification format ('[object Object]') when stringified.
- components/auto-paper-panel.tsx:77:335: error typescript(no-base-to-string): 'frame' may use Object's default stringification format ('[object Object]') when stringified.
