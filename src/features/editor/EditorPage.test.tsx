import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { _resetDBForTests, ensureActiveVolume, savePage } from '../../lib/db';
import { DB_NAME, PAGES_PER_VOLUME } from '../../lib/constants';
import EditorPage from './EditorPage';

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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/book/:volumeId/:pageNumber" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EditorPage (M4-T3)', () => {
  it('loads and displays content of the specified page', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 3, 'third page text');
    renderAt(`/book/${v.id}/3`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('third page text'));
  });

  it('shows empty textarea for a non-existent page number', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/20`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(''));
  });

  it('allows local editing (state updates)', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/1`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'typing…' } });
    expect(textarea.value).toBe('typing…');
  });

  it('header contains 本棚 link to /, current page number, and 設定 link', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/7`);
    expect(await screen.findByRole('link', { name: '本棚に戻る' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute('href', '/settings');
    expect(screen.getByText(`7 / ${PAGES_PER_VOLUME}`)).toBeInTheDocument();
  });

  it('falls back to page 1 for out-of-range page numbers', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'first');
    renderAt(`/book/${v.id}/999`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('first'));
    expect(screen.getByText(`1 / ${PAGES_PER_VOLUME}`)).toBeInTheDocument();
  });

  it('falls back to page 1 for non-numeric page numbers', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'first');
    renderAt(`/book/${v.id}/abc`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('first'));
    expect(screen.getByText(`1 / ${PAGES_PER_VOLUME}`)).toBeInTheDocument();
  });
});
