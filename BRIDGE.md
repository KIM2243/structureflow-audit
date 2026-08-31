# StructureFlow Kiwoom Bridge

키움 App Key와 Secret은 이 PC의 `.env`에만 보관합니다. 브리지는 현재가와 차트 조회만 제공하며 주문 기능은 제공하지 않습니다.

## 실행

`.env`에 32자 이상의 `KIWOOM_BRIDGE_TOKEN`을 설정한 뒤 일반 Windows Terminal에서 실행합니다.

```powershell
npm run bridge
```

정상 실행 시 다음 주소에서 상태를 확인할 수 있습니다.

```text
http://127.0.0.1:8790/health
```

`/api/quotes`와 `/api/market`은 `Authorization: Bearer <KIWOOM_BRIDGE_TOKEN>` 헤더가 없으면 접근할 수 없습니다.

## 운영 연결

외부에 공유기 포트를 개방하지 않습니다. 지속형 HTTPS 터널을 `http://127.0.0.1:8790`에 연결하고, 배포 환경에 다음 두 값을 비밀 설정으로 등록합니다.

- `KIWOOM_BRIDGE_URL`: 터널의 HTTPS 주소
- `KIWOOM_BRIDGE_TOKEN`: PC의 `.env`와 동일한 값

PC, 브리지, 터널이 모두 실행 중일 때 운영 사이트가 실시간 키움 데이터를 받을 수 있습니다.

`scripts/start-local-bridge.ps1`은 브리지와 Cloudflare Tunnel을 백그라운드로 함께 실행합니다. Windows 로그인 시 자동 실행 작업에 이 스크립트를 등록할 수 있습니다.
