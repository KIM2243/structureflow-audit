# StructureFlow Kiwoom Bridge

키움 App Key와 Secret은 이 PC의 `.env`에만 보관합니다. 브리지는 현재가와 차트 조회만 제공하며 주문 기능은 제공하지 않습니다.

## 실행과 상태 확인

`.env`에 32자 이상의 `KIWOOM_BRIDGE_TOKEN`과 Cloudflare의 `CLOUDFLARE_TUNNEL_TOKEN`을 설정합니다.

```powershell
npm run bridge
```

상태 확인 주소는 `http://127.0.0.1:8790/health`입니다. `/api/quotes`와 `/api/market`은 올바른 Bearer 토큰이 없으면 접근할 수 없습니다.

## Windows 로그인 시 자동 실행

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-bridge-autostart.ps1
```

자동 실행 작업은 로컬 브리지와 Cloudflare Tunnel을 함께 시작합니다. 공유기 포트를 개방하지 않으며, 외부 서비스는 HTTPS 터널 주소를 통해서만 브리지에 접근합니다.
