import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ChangeEvent,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import styles from './EditorPage.module.css';
import { getPage, updateVolumeLastOpenedPage } from '../../lib/db';
import { PAGES_PER_VOLUME } from '../../lib/constants';
import { useEditorAutoSave } from './useEditorAutoSave';

/** ページめくりフェードの所要時間 (ms)。global.css の --transition-page と同期させる。 */
const PAGE_FADE_MS = 180;

/**
 * EditorPage: 1 ページ = 1 textarea の独立 UI。
 *
 * URL: /book/:volumeId/:pageNumber
 * - ロード: getPage(volumeId, current) → textarea に content を流し込む
 * - 保存: useEditorAutoSave(volumeId, current, text) で 2 秒 debounce + flush
 * - ヘッダー: 左「本棚」/ 中央「‹ n / 50 ›」/ 右「設定」
 * - ページ遷移 (M5-T1/T2): 左右ボタン + 180ms フェード (--transition-page)。
 *   遷移前に autosave flush + lastOpenedPage 更新。
 *
 * スワイプ・PageUp/PageDown は後続タスク (M5-T3/T5) で追加。
 * 30 行ロック・IME ガード等は M6/M7 で追加。
 */
export default function EditorPage() {
  const params = useParams<{ volumeId: string; pageNumber: string }>();
  const navigate = useNavigate();
  const volumeId = params.volumeId ?? null;

  // pageNumber の解析: NaN / 範囲外 (<1, >PAGES_PER_VOLUME) は 1 にフォールバック
  const parsed = Number(params.pageNumber);
  const current =
    Number.isFinite(parsed) && parsed >= 1 && parsed <= PAGES_PER_VOLUME
      ? Math.floor(parsed)
      : 1;

  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  const [fading, setFading] = useState(false);

  // フェード中の連続クリック/タップ/キーを無視するロック
  const transitionLockRef = useRef(false);
  // 遷移用 setTimeout を unmount 時にクリーンアップするための ref
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ページ切替完了時にフェード状態とロックを解除する
  useEffect(() => {
    setFading(false);
    transitionLockRef.current = false;
  }, [volumeId, current]);

  // unmount 時にフェードタイマーを破棄
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  // autosave 配線（本番コードパス）
  const { flush } = useEditorAutoSave(ready ? volumeId : null, current, text);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value),
    []
  );

  /**
   * ページ遷移の共通処理 (M5-T1/T2)。
   * 1. 範囲外/フェード進行中ならガード。
   * 2. fading=true にして surface の opacity を 0 へフェード (180ms)。
   * 3. flush() で編集中テキストを確定保存（データロス防止）。
   * 4. Volume.lastOpenedPage を更新（次回復帰用）。
   * 5. 180ms 後に navigate。遷移先の useEffect で fading / lock は解除される。
   *
   * T5.3 (スワイプ) / T5.5 (キー) / T6.3 (自動遷移) からも同じ関数を呼ぶ（配線統一）。
   */
  const goPage = useCallback(
    (delta: number) => {
      if (!volumeId) return;
      if (transitionLockRef.current) return;
      const next = current + delta;
      if (next < 1 || next > PAGES_PER_VOLUME) return;
      transitionLockRef.current = true;
      setFading(true);
      void (async () => {
        try {
          await flush();
        } catch {
          // 保存失敗でも遷移は継続（次ページで再度編集可能）
        }
        try {
          await updateVolumeLastOpenedPage(volumeId, next);
        } catch {
          // 記憶更新失敗は致命的でないので握りつぶす
        }
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = setTimeout(() => {
          navigate(`/book/${volumeId}/${next}`);
        }, PAGE_FADE_MS);
      })();
    },
    [volumeId, current, flush, navigate]
  );

  const canGoPrev = current > 1;
  const canGoNext = current < PAGES_PER_VOLUME;

  return (
    <div className={styles.root} data-testid="editor-page">
      <header className={styles.header}>
        <Link to="/" aria-label="本棚に戻る">本棚</Link>
        <div className={styles.pageCluster}>
          <button
            type="button"
            className={styles.navBtn}
            aria-label="前のページ"
            onClick={() => goPage(-1)}
            disabled={!canGoPrev}
          >
            ‹
          </button>
          <div className={styles.pageNumber} aria-live="off">
            {current} / {PAGES_PER_VOLUME}
          </div>
          <button
            type="button"
            className={styles.navBtn}
            aria-label="次のページ"
            onClick={() => goPage(1)}
            disabled={!canGoNext}
          >
            ›
          </button>
        </div>
        <Link to="/settings" aria-label="設定">設定</Link>
      </header>

      <div
        className={`${styles.surface} ${fading ? styles.fading : ''}`}
        data-testid="editor-surface"
      >
        <textarea
          data-testid="editor-textarea"
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
    </div>
  );
}
