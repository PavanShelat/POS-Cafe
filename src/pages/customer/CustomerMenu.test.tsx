import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerMenu from './CustomerMenu';
import { apiGet } from '@/lib/api';

vi.mock('@/lib/api', () => ({ apiGet: vi.fn() }));

const apiGetMock = vi.mocked(apiGet);

const menu = (tableStatus = 'available') => ({
  table: { id: 't1', table_number: 'T1', seats: 4, status: tableStatus },
  categories: [{ id: 'c1', name: 'Coffee' }],
  products: [{ id: 'p1', name: 'Latte', category: 'c1', price: 200, active: true }],
  config: { restaurant_name: 'Bean & Brew', currency: 'Rs ', tax_rate: 5 },
});

const LOCKED = { valid: false, reason: 'Table is locked for ordering' };
const UNLOCKED = { valid: true, customer_session_token: 'session-1' };

// Routes each API path to a queue of responses (the last one repeats).
function mockApi(routes: Record<string, Array<unknown | Error>>) {
  apiGetMock.mockImplementation(async (path: string) => {
    const key = Object.keys(routes).find((prefix) => path.startsWith(prefix));
    if (!key) throw new Error(`unexpected call ${path}`);
    const queue = routes[key];
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return next;
  });
}

function renderMenu(token = 'qr-token-t1') {
  return render(
    <MemoryRouter initialEntries={[`/order/${encodeURIComponent(token)}`]}>
      <Routes>
        <Route path="/order/:tableToken" element={<CustomerMenu />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  apiGetMock.mockReset();
  sessionStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => vi.useRealTimers());

describe('CustomerMenu', () => {
  it('shows the menu when staff have unlocked the table', async () => {
    mockApi({ '/api/public/menu/': [menu()], '/api/customer/validate-session': [UNLOCKED] });
    renderMenu();
    expect(await screen.findByText('Latte')).toBeInTheDocument();
    expect(sessionStorage.getItem('customerSessionToken')).toBe('session-1');
  });

  it('lets seated guests order another round on an occupied table (FLOW-1)', async () => {
    mockApi({ '/api/public/menu/': [menu('occupied')], '/api/customer/validate-session': [UNLOCKED] });
    renderMenu();
    expect(await screen.findByText('Latte')).toBeInTheDocument();
    expect(screen.queryByText('Table Occupied')).not.toBeInTheDocument();
  });

  it('opens the menu by itself once staff unlock the table (FLOW-7)', async () => {
    mockApi({ '/api/public/menu/': [menu()], '/api/customer/validate-session': [LOCKED, LOCKED, UNLOCKED] });
    renderMenu();
    expect(await screen.findByText('Table Not Ready')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByText('Table Not Ready')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(await screen.findByText('Latte')).toBeInTheDocument();
  });

  it('has a Check again button while locked (FLOW-7)', async () => {
    mockApi({ '/api/public/menu/': [menu()], '/api/customer/validate-session': [LOCKED, UNLOCKED] });
    renderMenu();
    fireEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText('Latte')).toBeInTheDocument();
  });

  it('shows an error with a retry instead of spinning forever (FLOW-6)', async () => {
    mockApi({
      '/api/public/menu/': [new Error('The server is not responding right now (502).'), menu()],
      '/api/customer/validate-session': [UNLOCKED],
    });
    renderMenu();
    expect(await screen.findByText("Couldn't load the menu")).toBeInTheDocument();
    expect(screen.getByText(/not responding right now/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Latte')).toBeInTheDocument();
  });

  it('shows Invalid QR Code for an unknown table', async () => {
    mockApi({
      '/api/public/menu/': [new Error('Table not found')],
      '/api/customer/validate-session': [new Error('Table not found')],
    });
    renderMenu('nope');
    expect(await screen.findByText('Invalid QR Code')).toBeInTheDocument();
  });

  it('shows each category name once, with emoji icons but not word icons', async () => {
    mockApi({
      '/api/public/menu/': [{
        ...menu(),
        categories: [
          { id: 'c1', name: 'Coffee', icon: 'coffee' },
          { id: 'c2', name: 'Tea', icon: '🍵' },
          { id: 'c3', name: 'Desserts' },
        ],
      }],
      '/api/customer/validate-session': [UNLOCKED],
    });
    renderMenu();
    await screen.findByText('Latte');
    expect(screen.getByRole('button', { name: 'Coffee' })).toBeInTheDocument();
    expect(screen.queryByText('coffee')).not.toBeInTheDocument();
    const teaButton = screen.getByRole('button', { name: /Tea/ });
    expect(teaButton).toHaveTextContent('🍵');
    expect(teaButton.textContent?.match(/Tea/g)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Desserts' })).toBeInTheDocument();
  });

  it('URL-encodes the QR token (FLOW-8)', async () => {
    mockApi({ '/api/public/menu/': [menu()], '/api/customer/validate-session': [UNLOCKED] });
    renderMenu('a&b=c d');
    await screen.findByText('Latte');
    const paths = apiGetMock.mock.calls.map(([path]) => path);
    expect(paths).toContain('/api/customer/validate-session?qr_token=a%26b%3Dc%20d');
    expect(paths).toContain('/api/public/menu/a%26b%3Dc%20d');
  });
});
