import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import Fab from './Fab';

/**
 * M1-T0-2: Fab の from prop 検証。
 * - 引数なし → state.from === '/'（本棚＝従来挙動・完全不変）
 * - from="/log" → state.from === '/log'（メモ一覧から）
 */
function StateProbe({
  onState,
}: {
  onState: (s: { from?: string } | null) => void;
}) {
  const loc = useLocation();
  onState((loc.state as { from?: string } | null) ?? null);
  return null;
}

describe('Fab (M1-T0-2)', () => {
  it('引数なし → /log/new へ state.from="/"（本棚不変）', async () => {
    let state: { from?: string } | null = null;
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Fab />} />
          <Route
            path="/log/new"
            element={
              <StateProbe onState={(s) => (state = s)} />
            }
          />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'メモを書く' }));
    await waitFor(() =>
      expect((state as { from?: string } | null)?.from).toBe('/')
    );
  });

  it('from="/log" → /log/new へ state.from="/log"', async () => {
    let state: { from?: string } | null = null;
    render(
      <MemoryRouter initialEntries={['/log']}>
        <Routes>
          <Route path="/log" element={<Fab from="/log" />} />
          <Route
            path="/log/new"
            element={
              <StateProbe onState={(s) => (state = s)} />
            }
          />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'メモを書く' }));
    await waitFor(() =>
      expect((state as { from?: string } | null)?.from).toBe('/log')
    );
  });
});
