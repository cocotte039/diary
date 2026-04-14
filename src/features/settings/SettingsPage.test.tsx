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
  it('renders 本棚 link to / in the header (no 書く link)', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );
    const link = await waitFor(() =>
      screen.getByRole('link', { name: '本棚' })
    );
    expect(link).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: '書く' })).toBeNull();
  });
});
