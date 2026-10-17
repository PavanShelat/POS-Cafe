import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiGetBlob, apiPost } from './api';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'staff-token' } } }),
    },
  },
}));

const fetchMock = vi.fn();

function respond(body: string, status = 200, contentType = 'application/json') {
  fetchMock.mockResolvedValueOnce(new Response(body, { status, headers: { 'Content-Type': contentType } }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('apiGet', () => {
  it('returns parsed JSON', async () => {
    respond('{"ok":true}');
    await expect(apiGet('/api/health')).resolves.toEqual({ ok: true });
  });

  it("passes on the server's own error message", async () => {
    respond('{"error":"Table not found"}', 404);
    await expect(apiGet('/api/public/menu/x')).rejects.toThrow('Table not found');
  });

  // FLOW-6: these used to throw "Unexpected token '<'" and leave pages spinning.
  it('explains an HTML error page from a cold start or 502', async () => {
    respond('<!doctype html><h1>Bad Gateway</h1>', 502, 'text/html');
    await expect(apiGet('/api/public/menu/x')).rejects.toThrow(/not responding right now \(502\)/);
  });

  it('rejects an HTML page served with 200 (VITE_API_BASE_URL missing)', async () => {
    respond('<!doctype html><div id="root"></div>', 200, 'text/html');
    await expect(apiGet('/api/public/menu/x')).rejects.toThrow(/unexpected response/);
  });

  it('explains a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(apiGet('/api/health')).rejects.toThrow(/Can't reach the server/);
  });

  it('returns null for an empty successful body', async () => {
    respond('', 200);
    await expect(apiGet('/api/health')).resolves.toBeNull();
  });
});

describe('auth header', () => {
  it("sends the staff token by default", async () => {
    respond('{}');
    await apiGet('/api/bootstrap');
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer staff-token');
  });

  it('leaves it off for customer calls', async () => {
    respond('{}');
    await apiPost('/api/orders', { a: 1 }, { auth: false });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('Content-Type')).toBe('application/json');
  });
});

describe('apiGetBlob', () => {
  it('explains an HTML error page', async () => {
    respond('<html>oops</html>', 503, 'text/html');
    await expect(apiGetBlob('/api/orders/1/invoice')).rejects.toThrow(/not responding right now \(503\)/);
  });
});
