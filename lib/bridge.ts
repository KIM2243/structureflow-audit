const DEFAULT_BRIDGE_TIMEOUT_MS = 45_000;

function bridgeBaseUrl() {
  const value =
    process.env.KIWOOM_BRIDGE_URL ||
    process.env.CUSTOMER_HTTP_KIWOOM_BRIDGE ||
    '';
  return value.trim().replace(/\/$/, '');
}

export function isKiwoomBridgeConfigured() {
  return Boolean(bridgeBaseUrl());
}

export async function fetchFromKiwoomBridge(
  path: '/api/quotes' | '/api/market',
  search: URLSearchParams,
  signal?: AbortSignal,
) {
  const baseUrl = bridgeBaseUrl();
  const token = process.env.KIWOOM_BRIDGE_TOKEN?.trim();
  if (!baseUrl || !token) {
    throw new Error('키움 브리지 주소 또는 인증 토큰이 설정되지 않았습니다.');
  }

  const url = new URL(path, `${baseUrl}/`);
  url.search = search.toString();
  const timeout = AbortSignal.timeout(DEFAULT_BRIDGE_TIMEOUT_MS);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeout])
    : timeout;
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    signal: combinedSignal,
  });
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store, max-age=0',
      'X-StructureFlow-Data-Source': 'kiwoom-bridge',
    },
  });
}
