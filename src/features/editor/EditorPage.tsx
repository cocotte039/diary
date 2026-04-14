import { useEffect, useState, useCallback, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import styles from './EditorPage.module.css';
import { getPage, updateVolumeLastOpenedPage } from '../../lib/db';
import { PAGES_PER_VOLUME } from '../../lib/constants';
import { useEditorAutoSave } from './useEditorAutoSave';

/**
 * EditorPage: 1 ページ = 1 textarea の独立 UI (M4-T3)。
 *
 * URL: /book/:volumeId/:pageNumber
 * - ロード: getPage(volumeId, current) → textarea に content を流し込む
 * - 保存: useEditorAutoSave(volumeId, current, text) で 2 秒 debounce + flush
 * - ヘッダー: 左「本棚」/ 中央「n / 50」/ 右「設定」
 *
 * 30 行ロック・自動次ページ遷移・フェード等は後続マイルストーン (M5/M6/M7) で追加。
 */
export default function EditorPage() {
  const params = useParams<{ volumeId: string; pageNumber: string }>();
  const volumeId = params.volumeId ?? null;

  // pageNumber の解析: NaN / 範囲外 (<1, >PAGES_PER_VOLUME) は 1 にフォールバック
  const parsed = Number(params.pageNumber);
  const current =
    Number.isFinite(parsed) && parsed >= 1 && parsed <= PAGES_PER_VOLUME
      ? Math.floor(parsed)
      : 1;

  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      if (!volumeId) {
        if (!cancelled) {
          setText('');
          setReady(true);
        }
        return;
      }
      const page = await getPage(volumeId, current);
      if (cancelled) return;
      setText(page?.content ?? '');
      setReady(true);
      // 「最後に開いたページ」を記憶（次回本棚から同じページに戻れるように）
      // fire-and-forget: 失敗しても表示は継続
      void updateVolumeLastOpenedPage(volumeId, current).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [volumeId, current]);

  // autosave 配線（本番コードパス）
  useEditorAutoSave(ready ? volumeId : null, current, text);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value),
    []
  );

  return (
    <div className={styles.root} data-testid="editor-page">
      <header className={styles.header}>
        <Link to="/" aria-label="本棚に戻る">本棚</Link>
        <div className={styles.pageNumber} aria-live="off">
          {current} / {PAGES_PER_VOLUME}
        </div>
        <Link to="/settings" aria-label="設定">設定</Link>
      </header>

      <textarea
        className={`notebook-surface notebook-textarea ${styles.textarea}`}
        value={text}
        onChange={handleChange}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="日記本文"
      />
    </div>
  );
}
