import { beforeEach, describe, expect, it } from 'vitest';
import { buildExportPayload } from './export';
import {
  _resetDBForTests,
  ensureActiveVolume,
  saveVolumeText,
} from './db';
import { DB_NAME, EXPORT_FORMAT_VERSION } from './constants';

async function wipeDB() {
  _resetDBForTests();
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

describe('export.buildExportPayload', () => {
  it('returns format-versioned payload with volumes & pages', async () => {
    const v = await ensureActiveVolume();
    await saveVolumeText(v.id, 'hello world');
    const payload = await buildExportPayload();
    expect(payload.version).toBe(EXPORT_FORMAT_VERSION);
    expect(payload.volumes.length).toBeGreaterThan(0);
    expect(payload.pages.length).toBeGreaterThan(0);
    expect(typeof payload.exportedAt).toBe('string');
  });
});
