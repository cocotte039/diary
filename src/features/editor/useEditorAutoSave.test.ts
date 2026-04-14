import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { _resetDBForTests, ensureActiveVolume, getPage } from '../../lib/db';
import { DB_NAME, AUTOSAVE_DEBOUNCE_MS } from '../../lib/constants';
import { useEditorAutoSave } from './useEditorAutoSave';

// GitHub 同期側は背景 fire-and-forget なのでモック化（実 DB/ネット経由で発火しない）
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
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(async () => {
  vi.useRealTimers();
  await wipeDB();
});

describe('useEditorAutoSave (M4-T4)', () => {
  it('saves text to savePage after AUTOSAVE_DEBOUNCE_MS of idle', async () => {
    const v = await ensureActiveVolume();
    const { rerender } = renderHook(
      ({ text }: { text: string }) =>
        useEditorAutoSave(v.id, 1, text),
      { initialProps: { text: '' } }
    );
    rerender({ text: 'hello' });

    // Before debounce elapses, nothing is saved
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 100);
    });
    let p = await getPage(v.id, 1);
    expect(p?.content ?? '').toBe('');

    // After debounce elapses, save fires
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    p = await getPage(v.id, 1);
    expect(p?.content).toBe('hello');
  });

  it('debounces rapid text changes into a single save', async () => {
    const v = await ensureActiveVolume();
    const { rerender } = renderHook(
      ({ text }: { text: string }) =>
        useEditorAutoSave(v.id, 1, text),
      { initialProps: { text: '' } }
    );
    rerender({ text: 'a' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    rerender({ text: 'ab' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    rerender({ text: 'abc' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    });
    const p = await getPage(v.id, 1);
    expect(p?.content).toBe('abc');
  });

  it('flush() immediately saves the current pending text', async () => {
    const v = await ensureActiveVolume();
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useEditorAutoSave(v.id, 1, text),
      { initialProps: { text: '' } }
    );
    rerender({ text: 'flushed' });
    // flush without waiting for debounce
    await act(async () => {
      await result.current.flush();
    });
    const p = await getPage(v.id, 1);
    expect(p?.content).toBe('flushed');
  });

  it('does not save when text is unchanged from last saved (no-op)', async () => {
    const v = await ensureActiveVolume();
    const { rerender } = renderHook(
      ({ text }: { text: string }) =>
        useEditorAutoSave(v.id, 1, text),
      { initialProps: { text: '' } }
    );
    rerender({ text: 'same' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    });
    const firstUpdatedAt = (await getPage(v.id, 1))?.updatedAt;
    // Wait > 1ms so that ISO timestamps would differ if a save actually occurred
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    // Re-submit same text; debounced save should be no-op
    rerender({ text: 'same' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    });
    const secondUpdatedAt = (await getPage(v.id, 1))?.updatedAt;
    expect(secondUpdatedAt).toBe(firstUpdatedAt);
  });

  it('flush() after debounce-save with same text is a no-op', async () => {
    const v = await ensureActiveVolume();
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useEditorAutoSave(v.id, 1, text),
      { initialProps: { text: '' } }
    );
    rerender({ text: 'hello' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    });
    const firstUpdatedAt = (await getPage(v.id, 1))?.updatedAt;
    await act(async () => {
      await result.current.flush();
    });
    const secondUpdatedAt = (await getPage(v.id, 1))?.updatedAt;
    expect(secondUpdatedAt).toBe(firstUpdatedAt);
  });

  it('calls syncPendingPagesBackground after save', async () => {
    const { syncPendingPagesBackground } = await import('../../lib/github');
    const v = await ensureActiveVolume();
    const { rerender } = renderHook(
      ({ text }: { text: string }) =>
        useEditorAutoSave(v.id, 1, text),
      { initialProps: { text: '' } }
    );
    rerender({ text: 'trigger' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(syncPendingPagesBackground).toHaveBeenCalled();
  });
});
