import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import styles from './EditorPage.module.css';
import {
  getPage,
  getVolume,
  updateVolumeLastOpenedPage,
} from '../../lib/db';
import {
  CHARS_PER_PAGE,
  PAGES_PER_VOLUME,
  SWIPE_THRESHOLD_PX,
} from '../../lib/constants';
import { useEditorAutoSave } from './useEditorAutoSave';
import { useEditorCursor } from '../../hooks/useEditorCursor';
import DateIcon from './DateIcon';

/** 曜日の日本語表記（日=0 … 土=6 に対応）。WritePage から踏襲。 */
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/**
 * 今日の日付を `YYYY年M月D日(曜)\n` 形式でフォーマットする。
 * WritePage.formatToday() の完全踏襲（丸括弧は半角、末尾改行を含む）。
 */
function formatToday(): string {
  const d = new Date();
  const w = WEEKDAYS_JA[d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${w})\n`;
}

/** ページめくりフェードの所要時間 (ms)。global.css の --transition-page と同期させる。 */
const PAGE_FADE_MS = 180;

/**
 * EditorPage: 1 ページ = 1 textarea の独立 UI。
 *
 * URL: /book/:volumeId/:pageNumber
 * - ロード: getPage(volumeId, current) → textarea に content を流し込む
 * - 保存: useEditorAutoSave(volumeId, current, text) で 2 秒 debounce + flush
 * - ヘッダー: 左「本棚」/ 中央「‹ n / PAGES_PER_VOLUME ›」/ 右「設定」
 * - ページ遷移 (M5-T1/T2/T3/T5): 左右ボタン + 180ms フェード (--transition-page)
 *   + 左右スワイプ（B 案: textarea 上でも水平優位 2:1 のスワイプで反応, M8-2）
 *   + PageUp/PageDown キー（textarea にフォーカスがある時のみ）。
 *   遷移前に autosave flush + lastOpenedPage 更新。
 *
 * 文字数上限は撤廃済み（1200 字超でも書き続けられる）。進捗バーのみ
 * CHARS_PER_PAGE=1200 を使って 100% 固定表示する。
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
  // M9-M4: 冊ステータスに応じた初回カーソル位置のフォールバック。
  // active なら末尾（続きを書く）、completed なら先頭（読み返す）。
  const [cursorFallback, setCursorFallback] = useState<'end' | 'start'>('end');

  // フェード中の連続クリック/タップ/キーを無視するロック
  const transitionLockRef = useRef(false);
  // 遷移用 setTimeout を unmount 時にクリーンアップするための ref
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // スワイプ開始座標 (M5-T3)
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  // textarea 参照（カーソル復元 M5-T4 用）
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // M3: 外側スクロールコンテナ (.surface) 参照。カーソル復元時の scrollTop 宛先。
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // IME 変換中フラグ (M6-T2)。スワイプ・PageUp/PageDown の誤発火防止に使用。
  const isComposingRef = useRef(false);
  // 戻るボタンガードの二重 pushState を防ぐ ref (StrictMode 対策)
  const historyGuardInstalledRef = useRef(false);

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
      const [page, volume] = await Promise.all([
        getPage(volumeId, current),
        getVolume(volumeId),
      ]);
      if (cancelled) return;
      setText(page?.content ?? '');
      // M9-M4: 書きかけ（active）は末尾、完了済みは先頭にカーソルを置く（localStorage が無いとき）
      setCursorFallback(volume?.status === 'active' ? 'end' : 'start');
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

  useEffect(() => {
    // Android 端末の戻るボタン（popstate）で本棚 (`/`) に戻すためのガード。
    // マウント時にダミー履歴を 1 件積み、popstate で flush → navigate('/', replace) する。
    // StrictMode 二重マウントに備え pushState は ref で 1 回に制限する。
    if (!historyGuardInstalledRef.current) {
      window.history.pushState({ editorGuard: true }, '');
      historyGuardInstalledRef.current = true;
    }
    const onPopState = () => {
      void flush().catch(() => {});
      navigate('/', { replace: true });
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [flush, navigate]);

  // カーソル復元 (M5-T4 / M9-M4): ページ単位でスコープ化された localStorage キーを使う。
  // M3: scrollTop 宛先として .surface ref を渡す（外側スクロール化に追随）。
  const { onSelectionChange } = useEditorCursor(
    textareaRef,
    text,
    ready,
    volumeId,
    current,
    cursorFallback,
    surfaceRef
  );

  /**
   * M10-M2-T4: textarea 高さを内容の scrollHeight に追従させる。
   * 紙高さの下限（空ページでも 60 本の罫線を描画するための min-height）は
   * CSS 側（M3 の `.textarea { min-height: var(--page-height-px) }`）で保証する。
   */
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text, ready]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setText(value);
      const t = e.target as HTMLTextAreaElement;
      onSelectionChange(t.selectionStart ?? 0);
    },
    [onSelectionChange]
  );

  const handleSelect = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const t = e.currentTarget;
      onSelectionChange(t.selectionStart ?? 0);
    },
    [onSelectionChange]
  );

  // M6-T2: IME (composition) ガード。
  // スワイプ（L456）/ PageUp/PageDown（L440）の誤発火防止用に ref を更新する。
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
  }, []);

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

  /**
   * M7-T4 / M2-T2.1: カーソル位置に今日の日付スタンプを挿入する。
   * - 挿入後は textarea の selectionRange をスタンプ末尾に移動
   * - state も即時に更新（onChange と同じ経路）
   * - 文字数上限は撤廃済み（1200 字超でも現ページに留まる）。
   * - M2-T2.1: `.surface`（外側スクロールコンテナ）の scrollTop を挿入前に保存し、
   *   rAF 内の focus() / setSelectionRange() 実行後に明示的に復元する。
   *   ブラウザでは focus() / setSelectionRange() が祖先スクロールコンテナの
   *   scrollTop をリセットする副作用を持つため、このガードでページ先頭への
   *   ジャンプを防ぐ（読み返し中に日付挿入しても読んでいた位置が維持される）。
   */
  const insertDate = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const stamp = formatToday();
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const nextValue = el.value.slice(0, start) + stamp + el.value.slice(end);
    // .surface (外側スクロールコンテナ) の scrollTop を保存。
    // focus() / setSelectionRange() は React 再レンダリング後に scrollTop を
    // リセットする副作用を持つため、rAF 後に明示的に復元する。
    const savedScrollTop = surfaceRef.current?.scrollTop ?? 0;
    setText(nextValue);
    const nextPos = start + stamp.length;
    // DOM 反映後にカーソル位置を復元（React 19 でも rAF 1 フレーム必要）
    requestAnimationFrame(() => {
      const cur = textareaRef.current;
      if (!cur) return;
      cur.focus();
      const clamped = Math.max(0, Math.min(nextPos, cur.value.length));
      cur.setSelectionRange(clamped, clamped);
      if (surfaceRef.current) surfaceRef.current.scrollTop = savedScrollTop;
    });
    onSelectionChange(nextPos);
  }, [onSelectionChange]);

  const canGoPrev = current > 1;
  const canGoNext = current < PAGES_PER_VOLUME;

  // M4: ページ残量のプログレス率（0〜100 の整数パーセンテージ）。
  // 1200 字超のページ（既存データ）をロードした場合も 100 に clamp する。
  const progressPct = Math.min(
    100,
    Math.round((text.length / CHARS_PER_PAGE) * 100)
  );

  // --- スワイプ (M5-T3 → M8-2 B 案) ---
  // B 案: textarea 上でも発火させ、水平優位 (|dx| > |dy| * 2) を必須にして
  // 縦スクロール・改行入力との干渉を避ける。IME 変換中は onTouchEnd 側で発火させない。
  const onTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (!t) {
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      return;
    }
    touchStartXRef.current = t.clientX;
    touchStartYRef.current = t.clientY;
  };

  // --- キーボード (M5-T5): PageUp / PageDown ---
  // preventDefault でブラウザ標準のスクロール動作を抑止してから goPage を呼ぶ。
  // M6-T2: IME 変換中は遷移を発動させない（composition 中の PageUp/Down で誤遷移防止）。
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposingRef.current) return;
    if (e.key === 'PageUp') {
      e.preventDefault();
      goPage(-1);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      goPage(1);
    }
  };

  const onTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (startX == null || startY == null) return;
    if (isComposingRef.current) return; // IME 変換中は発火しない
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dx) <= Math.abs(dy) * 2) return; // 水平優位 2:1
    if (dx < 0) goPage(1); // 左スワイプ → 次
    else goPage(-1); // 右スワイプ → 前
  };

  return (
    <div
      className={styles.root}
      data-testid="editor-page"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <header className={`app-header ${styles.header}`}>
        <div className={styles.headerLeft}>
          <Link to="/" aria-label="本棚に戻る" className="app-header-link">本棚</Link>
        </div>
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
          <div
            className={styles.pageNumber}
            aria-live="off"
            data-testid="page-indicator"
          >
            <span className={styles.pageCurrent}>{current}</span>
            <span className={styles.pageSeparator}>{' / '}</span>
            <span className={styles.pageTotal}>{PAGES_PER_VOLUME}</span>
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
        <div className={styles.headerRight}>
          <button
            type="button"
            className={styles.headerDateButton}
            aria-label="今日の日付を挿入"
            onClick={insertDate}
          >
            <DateIcon />
          </button>
        </div>
      </header>

      {/*
       * M4: ページ残量のプログレスバー。
       * ヘッダー直下に常時表示し、text.length / CHARS_PER_PAGE で塗りが伸びる。
       * 色・数値・アニメーション（塗り幅 120ms transition を除く）は付けない。
       */}
      <div
        className={styles.progress}
        role="progressbar"
        aria-label="ページの残量"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPct}
        data-testid="page-progress"
      >
        <div
          className={styles.progressFill}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div
        ref={surfaceRef}
        className={`${styles.surface} ${fading ? styles.fading : ''}`}
        data-testid="editor-surface"
      >
        <textarea
          ref={textareaRef}
          data-testid="editor-textarea"
          className={`notebook-surface notebook-textarea ${styles.textarea}`}
          value={text}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
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
