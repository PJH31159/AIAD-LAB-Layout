import { describe, expect, it } from 'vitest';
import { shouldRetryRequest } from './supabaseProjects';

describe('Supabase 요청 재시도', () => {
  it('조회 요청의 일시적 네트워크 오류만 재시도합니다.', () => {
    const networkError = new TypeError('network failed');
    expect(shouldRetryRequest('GET', networkError, 2)).toBe(true);
    expect(shouldRetryRequest('HEAD', networkError, 1)).toBe(true);
    expect(shouldRetryRequest('POST', networkError, 2)).toBe(false);
    expect(shouldRetryRequest('PATCH', networkError, 2)).toBe(false);
    expect(shouldRetryRequest('GET', new Error('HTTP 500'), 2)).toBe(false);
    expect(shouldRetryRequest('GET', networkError, 0)).toBe(false);
  });
});
