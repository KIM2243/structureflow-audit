# 공개 사본의 범위와 검증

- 원본 HEAD: 08780d5f876a8c80a2991e89b41c8dffb1c0af15
- 원본 저장소를 수정하지 않고 별도 객체 저장소에 86개 커밋을 순서/부모 관계/메시지/작성 시각 그대로 복사했다. squash하지 않았다.
- 유일한 역사적 파일 내용 예외: drizzle/0005_reset_admin_password.sql. 실제 계정의 비밀번호 hash/salt/식별자를 포함한 일회성 데이터 변경이므로 모든 공개 커밋에서 무해한 SELECT 1 stub으로 교체했다. 스키마 변경은 없던 파일이다. 이로 인해 해당 커밋과 후속 SHA가 달라진다. 원본 이력은 로컬에 보존한다.
- 패키징용 .env.example/.gitignore를 제외한 원본 186개 파일은 HEAD에서 바이트 동일성과 SHA-256을 검증한다. source-manifest.json 참조. 감사 문서, 변수 이름만 담은 .env.example, 보강된 .gitignore는 공개 준비 변경이다.
- 과거 reachable blob 전체를 대상으로 개인키/token 패턴, secret 대입, credential SQL 및 제외 경로를 점검했다. API의 매개변수화 SQL과 테스트용 mock/test 값은 실제 자격증명이 아니므로 보존했다. 탐지기의 무결점 보증은 아니다.
- 의존성/빌드/캐시/로그/임시 압축파일/실제 DB·R2 자료/환경 키/로컬 복구 파일은 복사하지 않았다. 원본 추적 파일만 이력에 포함했다.
- 원본에서 2026-09-28 전체 Node 테스트 120/120, tsc --noEmit, production build를 확인했다. 운영 인증과 실제 공급자 연결은 별도 환경 의존이며 이번 GitHub 작업에서 재배포하지 않았다.
- source-manifest.json은 문서 추가 전 원본 파일 기준이다. state=security-stub 또는 packaging으로 표시한 항목 외 모든 파일은 동일해야 한다.
- 공개 GitHub에는 main만 push한다. 민감 원본 객체나 원본 remote/ref를 이 저장소로 복사하지 않았다.
