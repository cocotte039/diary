import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './SettingsPage.module.css';
import { exportAllData } from '../../lib/export';
import {
  clearGitHubSettings,
  getGitHubSettings,
  getPendingPages,
  setGitHubSettings,
} from '../../lib/db';
import {
  importFromGitHub,
  syncPendingPages,
  testConnection,
  type ImportProgress,
} from '../../lib/github';
import type { GitHubSettings } from '../../types';

/**
 * 設定画面。エクスポート / GitHub 接続設定 / 同期状態を提供。
 */
export default function SettingsPage() {
  const [token, setToken] = useState('');
  const [ownerRepo, setOwnerRepo] = useState('');
  const [status, setStatus] = useState<{ msg: string; error?: boolean } | null>(
    null
  );
  const [pending, setPending] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null
  );

  useEffect(() => {
    (async () => {
      const s = await getGitHubSettings();
      if (s) {
        setToken(s.token);
        setOwnerRepo(`${s.owner}/${s.repo}`);
      }
      const p = await getPendingPages();
      setPending(p.length);
      setLoaded(true);
    })();
  }, []);

  const parseOwnerRepo = (
    s: string
  ): { owner: string; repo: string } | null => {
    const m = s.trim().match(/^([^/\s]+)\/([^/\s]+)$/);
    return m ? { owner: m[1], repo: m[2] } : null;
  };

  const onExport = async () => {
    try {
      await exportAllData();
      setStatus({ msg: 'エクスポートしました' });
    } catch (err) {
      setStatus({ msg: `エクスポート失敗: ${String(err)}`, error: true });
    }
  };

  const onSaveGithub = async () => {
    const parsed = parseOwnerRepo(ownerRepo);
    if (!parsed || !token) {
      setStatus({ msg: 'トークンと owner/repo を正しく入力してください', error: true });
      return;
    }
    const s: GitHubSettings = { token, owner: parsed.owner, repo: parsed.repo };
    await setGitHubSettings(s);
    setStatus({ msg: '保存しました' });
  };

  const onTest = async () => {
    const parsed = parseOwnerRepo(ownerRepo);
    if (!parsed || !token) {
      setStatus({ msg: '入力を確認してください', error: true });
      return;
    }
    setStatus({ msg: '接続中…' });
    const res = await testConnection({ token, ...parsed });
    setStatus({ msg: res.message, error: !res.ok });
  };

  const onSync = async () => {
    setStatus({ msg: '同期中…' });
    const res = await syncPendingPages();
    const p = await getPendingPages();
    setPending(p.length);
    setStatus({
      msg: `同期完了: ${res.synced}件、失敗: ${res.failed}件`,
      error: res.failed > 0,
    });
  };

  const onClear = async () => {
    await clearGitHubSettings();
    setToken('');
    setOwnerRepo('');
    setStatus({ msg: '設定を削除しました' });
  };

  const onImport = async () => {
    const ok = window.confirm(
      'GitHub からインポートすると、現在のローカルデータ（すべての冊とページ）は置き換えられます。続行しますか？'
    );
    if (!ok) return;
    setImporting(true);
    setStatus({ msg: 'インポートを開始します…' });
    setImportProgress({ phase: 'preparing', current: 0, total: 0 });
    try {
      const res = await importFromGitHub((p) => setImportProgress(p));
      setStatus({
        msg: `インポート完了: ${res.volumes}冊 / ${res.pages}ページ を復元しました`,
      });
      const p = await getPendingPages();
      setPending(p.length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ msg: `インポート失敗: ${msg}`, error: true });
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const progressText = (p: ImportProgress): string => {
    switch (p.phase) {
      case 'preparing':
        return 'ファイル一覧を取得中…';
      case 'fetching':
        return `ページ取得中… ${p.current} / ${p.total}`;
      case 'writing':
        return 'ローカルに書き込み中…';
      case 'done':
        return '完了';
    }
  };

  if (!loaded) return null;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1 className={styles.title}>設定</h1>
        <Link to="/">書く</Link>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>データをエクスポート</h2>
        <button type="button" className={styles.button} onClick={onExport}>
          JSONでエクスポート
        </button>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>GitHubバックアップ</h2>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="gh-token">
            Personal Access Token
          </label>
          <input
            id="gh-token"
            className={styles.input}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="gh-repo">
            リポジトリ (owner/repo)
          </label>
          <input
            id="gh-repo"
            className={styles.input}
            type="text"
            value={ownerRepo}
            onChange={(e) => setOwnerRepo(e.target.value)}
            placeholder="your-name/diary-backup"
            autoComplete="off"
          />
        </div>
        <button type="button" className={styles.button} onClick={onSaveGithub}>
          保存
        </button>
        <button type="button" className={styles.button} onClick={onTest}>
          接続テスト
        </button>
        <button type="button" className={styles.button} onClick={onSync}>
          今すぐ同期
        </button>
        <button type="button" className={styles.button} onClick={onClear}>
          設定を削除
        </button>
        <div className={styles.status}>未同期ページ: {pending}件</div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>GitHubから復元</h2>
        <p className={styles.status}>
          別端末やデータ消失時に、GitHub
          に保存したバックアップから全データを復元します。現在のローカルデータは置き換えられます。
        </p>
        <button
          type="button"
          className={styles.button}
          onClick={onImport}
          disabled={importing}
        >
          {importing ? 'インポート中…' : 'GitHub からインポート'}
        </button>
        {importProgress && (
          <div className={styles.status} role="status">
            {progressText(importProgress)}
          </div>
        )}
      </section>

      {status && (
        <div
          className={`${styles.status} ${status.error ? styles.error : ''}`}
          role="status"
        >
          {status.msg}
        </div>
      )}
    </div>
  );
}
