import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { _resetDBForTests } from '../../lib/db';
import { DB_NAME } from '../../lib/constants';
import SettingsPage from './SettingsPage';

vi.mock('../../lib/github', () => ({
  importFromGitHub: vi.fn(),
  syncPendingPages: vi.fn(),
  testConnection: vi.fn(),
}));

async function wipeDB() {
  await _resetDBForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await wipeDB();
});
afterEach(async () => {
  await wipeDB();
});

describe('SettingsPage header (M4-T6)', () => {
  // M3-T3 回帰更新: ヘッダーは「本棚→/」固定から「閉じる→location.state.from」へ
  // 意図的に変更（spec m3-t3）。旧 '本棚'→'/' 固定の前提が消えたため、本ケースを
  // 削除せず新仕様（'閉じる'リンク・state 無し→'/' フォールバック・書く link 不在）の
  // 検証へ回帰更新。AGENTS.md T3.2/App.test 前例（意図的文言変更に伴う回帰更新）に準拠。
  it('renders 閉じる link to / fallback in the header (no 書く link)', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );
    const link = await waitFor(() =>
      screen.getByRole('link', { name: '設定を閉じる' })
    );
    expect(link).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: '書く' })).toBeNull();
  });
});

describe('SettingsPage header 閉じる link (M3-T3)', () => {
  it('state.from="/log" → 閉じる link to が /log', async () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/settings', state: { from: '/log' } }]}
      >
        <SettingsPage />
      </MemoryRouter>
    );
    const link = await waitFor(() =>
      screen.getByRole('link', { name: '設定を閉じる' })
    );
    expect(link).toHaveAttribute('href', '/log');
  });

  it('state.from="/" → 閉じる link to が /', async () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/settings', state: { from: '/' } }]}
      >
        <SettingsPage />
      </MemoryRouter>
    );
    const link = await waitFor(() =>
      screen.getByRole('link', { name: '設定を閉じる' })
    );
    expect(link).toHaveAttribute('href', '/');
  });

  it('state 無し（直接URL/リロード）→ 閉じる link to が / (fallback)', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    );
    const link = await waitFor(() =>
      screen.getByRole('link', { name: '設定を閉じる' })
    );
    expect(link).toHaveAttribute('href', '/');
  });
});
