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

type SectionStatus = { msg: string; error?: boolean } | null;

/**
 * 設定画面。エクスポート / GitHub 接続設定 / 同期状態を提供。
 * UX 方針:
 *  - 各アクションの結果はセクション内に直下表示する（全体下部に埋もれない）
 *  - 非同期操作中はボタンを disabled 化して二重送信を防ぐ
 *  - 破壊的操作（削除）は confirm() で明示確認
 */
export default function SettingsPage() {
  const [token, setToken] = useState('');
  const [ownerRepo, setOwnerRepo] = useState('');
  const [pending, setPending] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);

  // 各セクションの結果表示（エクスポート / GitHub / インポート）
  const [exportStatus, setExportStatus] = useState<SectionStatus>(null);
  const [githubStatus, setGithubStatus] = useState<SectionStatus>(null);
  const [importStatus, setImportStatus] = useState<SectionStatus>(null);

  // 各操作の進行フラグ
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
    setExportStatus({ msg: 'エクスポート中…' });
    try {
      await exportAllData();
      setExportStatus({ msg: 'エクスポートしました' });
    } catch (err) {
      setExportStatus({
        msg: `エクスポート失敗: ${String(err)}`,
        error: true,
      });
    }
  };

  const onSaveGithub = async () => {
    const parsed = parseOwnerRepo(ownerRepo);
    if (!parsed || !token) {
      setGithubStatus({
        msg: 'トークンと owner/repo を正しく入力してください',
        error: true,
      });
      return;
    }
    setSaving(true);
    setGithubStatus({ msg: '保存中…' });
    try {
      const s: GitHubSettings = {
        token,
        owner: parsed.owner,
        repo: parsed.repo,
      };
      await setGitHubSettings(s);
      setGithubStatus({ msg: '✓ 保存しました' });
    } catch (err) {
      setGithubStatus({
        msg: `保存失敗: ${String(err)}`,
        error: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    const parsed = parseOwnerRepo(ownerRepo);
    if (!parsed || !token) {
      setGithubStatus({ msg: '入力を確認してください', error: true });
      return;
    }
    setTesting(true);
    setGithubStatus({ msg: '接続中…' });
    try {
      const res = await testConnection({ token, ...parsed });
      setGithubStatus({
        msg: res.ok ? `✓ ${res.message}` : res.message,
        error: !res.ok,
      });
    } finally {
      setTesting(false);
    }
  };

  const onSync = async () => {
    setSyncing(true);
    setGithubStatus({ msg: '同期中… GitHub に push しています' });
    try {
      const res = await syncPendingPages();
      const p = await getPendingPages();
      setPending(p.length);
      if (res.synced === 0 && res.failed === 0) {
        setGithubStatus({ msg: '同期するページはありません（すべて同期済み）' });
      } else {
        setGithubStatus({
          msg: `✓ 同期完了: ${res.synced}件 push${
            res.failed > 0 ? ` / 失敗 ${res.failed}件` : ''
          }`,
          error: res.failed > 0,
        });
      }
    } catch (err) {
      setGithubStatus({
        msg: `同期失敗: ${err instanceof Error ? err.message : String(err)}`,
        error: true,
      });
    } finally {
      setSyncing(false);
    }
  };

  const onClear = async () => {
    const confirmed = window.confirm(
      'GitHub 設定（トークンとリポジトリ名）を削除します。\n\n' +
        'この操作では GitHub 上のバックアップデータやローカルの日記は消えません。\n' +
        '設定を削除すると、再入力するまで同期とインポートができなくなります。\n\n' +
        '削除しますか？'
    );
    if (!confirmed) return;
    try {
      await clearGitHubSettings();
      setToken('');
      setOwnerRepo('');
      setGithubStatus({ msg: '設定を削除しました' });
    } catch (err) {
      setGithubStatus({
        msg: `削除失敗: ${String(err)}`,
        error: true,
      });
    }
  };

  const onImport = async () => {
    const ok = window.confirm(
      'GitHub からインポートすると、現在のローカルデータ（すべての冊とページ）は置き換えられます。\n\n続行しますか？'
    );
    if (!ok) return;
    setImporting(true);
    setImportStatus({ msg: 'インポートを開始します…' });
    setImportProgress({ phase: 'preparing', current: 0, total: 0 });
    try {
      const res = await importFromGitHub((p) => setImportProgress(p));
      setImportStatus({
        msg: `✓ インポート完了: ${res.volumes}冊 / ${res.pages}ページ を復元しました`,
      });
      const p = await getPendingPages();
      setPending(p.length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportStatus({ msg: `インポート失敗: ${msg}`, error: true });
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

  const renderStatus = (s: SectionStatus) =>
    s && (
      <div
        className={`${styles.status} ${s.error ? styles.error : styles.statusVisible}`}
        role="status"
        aria-live="polite"
      >
        {s.msg}
      </div>
    );

  if (!loaded) return null;

  const busy = saving || testing || syncing || importing;

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
        {renderStatus(exportStatus)}
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
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.button}
            onClick={onSaveGithub}
            disabled={busy}
          >
            {saving ? '保存中…' : '保存'}
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={onTest}
            disabled={busy}
          >
            {testing ? 'テスト中…' : '接続テスト'}
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={onSync}
            disabled={busy}
          >
            {syncing ? '同期中…' : '今すぐ同期'}
          </button>
        </div>
        {renderStatus(githubStatus)}
        <div className={styles.status}>未同期ページ: {pending}件</div>

        <div className={styles.destructiveRow}>
          <button
            type="button"
            className={`${styles.button} ${styles.destructive}`}
            onClick={onClear}
            disabled={busy}
          >
            設定を削除
          </button>
          <span className={styles.destructiveHint}>
            ※ 確認ダイアログが出ます
          </span>
        </div>
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
          disabled={busy}
        >
          {importing ? 'インポート中…' : 'GitHub からインポート'}
        </button>
        {importProgress && (
          <div
            className={`${styles.status} ${styles.statusVisible}`}
            role="status"
            aria-live="polite"
          >
            {progressText(importProgress)}
          </div>
        )}
        {renderStatus(importStatus)}
      </section>
    </div>
  );
}
