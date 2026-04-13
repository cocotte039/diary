import { EXPORT_FORMAT_VERSION } from './constants';
import { getAllPages, getAllVolumes } from './db';
import type { ExportPayload } from '../types';

/**
 * 全データを JSON 形式でエクスポートしてダウンロードさせる。
 * ファイル名: note-backup-YYYY-MM-DD.json
 */
export async function exportAllData(): Promise<void> {
  const payload = await buildExportPayload();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    a.download = `note-backup-${yyyy}-${mm}-${dd}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** テスト可能な純粋部分: payload を組み立てるのみ */
export async function buildExportPayload(): Promise<ExportPayload> {
  const [volumes, pages] = await Promise.all([getAllVolumes(), getAllPages()]);
  return {
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    volumes,
    pages,
  };
}
