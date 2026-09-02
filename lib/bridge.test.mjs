import assert from 'node:assert/strict';
import test from 'node:test';

import { isKiwoomBridgeConfigured } from './bridge.ts';

test('운영 브리지는 주소와 토큰이 모두 있을 때만 활성화된다', () => {
  const originalUrl = process.env.KIWOOM_BRIDGE_URL;
  const originalToken = process.env.KIWOOM_BRIDGE_TOKEN;
  try {
    process.env.KIWOOM_BRIDGE_URL = 'https://bridge.example.com';
    delete process.env.KIWOOM_BRIDGE_TOKEN;
    assert.equal(isKiwoomBridgeConfigured(), false);
    process.env.KIWOOM_BRIDGE_TOKEN = 'test-token';
    assert.equal(isKiwoomBridgeConfigured(), true);
  } finally {
    if (originalUrl === undefined) delete process.env.KIWOOM_BRIDGE_URL;
    else process.env.KIWOOM_BRIDGE_URL = originalUrl;
    if (originalToken === undefined) delete process.env.KIWOOM_BRIDGE_TOKEN;
    else process.env.KIWOOM_BRIDGE_TOKEN = originalToken;
  }
});
