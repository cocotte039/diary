import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  _resetDBForTests,
  ensureActiveVolume,
  replaceAllData,
  savePage,
  updateVolumeLastOpenedPage,
} from '../../lib/db';
import { DB_NAME } from '../../lib/constants';
import BookshelfPage from './BookshelfPage';
import type { Page, Volume } from '../../types';

vi.mock('../../lib/github', () => ({
  syncPendingPagesBackground: vi.fn(),
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

function renderPage() {
  return render(
    <MemoryRouter>
      <BookshelfPage />
    </MemoryRouter>
  );
}

describe('BookshelfPage link targets (M4-T5)', () => {
  it('links to /book/{id}/{lastOpenedPage} when lastOpenedPage is set', async () => {
    const v = await ensureActiveVolume();
    await updateVolumeLastOpenedPage(v.id, 4);
    renderPage();
    const link = await screen.findByRole('link', {
      name: new RegExp(`第${v.ordinal}冊`),
    });
    await waitFor(() =>
      expect(link).toHaveAttribute('href', `/book/${v.id}/4`)
    );
  });

  it('falls back to latest-updated page when lastOpenedPage is missing', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'a');
    // small gap so updatedAt differs
    await new Promise((r) => setTimeout(r, 5));
    await savePage(v.id, 3, 'c');
    await new Promise((r) => setTimeout(r, 5));
    await savePage(v.id, 2, 'b-latest'); // page 2 has latest updatedAt
    renderPage();
    const link = await screen.findByRole('link', {
      name: new RegExp(`第${v.ordinal}冊`),
    });
    await waitFor(() =>
      expect(link).toHaveAttribute('href', `/book/${v.id}/2`)
    );
  });

  it('uses page 1 for a brand-new volume with no pages', async () => {
    const volumes: Volume[] = [
      {
        id: 'vx',
        ordinal: 1,
        status: 'active',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    const pages: Page[] = [];
    await replaceAllData(volumes, pages);
    renderPage();
    const link = await screen.findByRole('link', { name: /第1冊/ });
    await waitFor(() => expect(link).toHaveAttribute('href', '/book/vx/1'));
  });

  it('link href begins with /book/ (no /read/)', async () => {
    const v = await ensureActiveVolume();
    renderPage();
    const link = await screen.findByRole('link', {
      name: new RegExp(`第${v.ordinal}冊`),
    });
    await waitFor(() =>
      expect(link.getAttribute('href')).toMatch(/^\/book\//)
    );
  });
});
