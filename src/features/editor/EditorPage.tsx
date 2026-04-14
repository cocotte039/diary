import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ChangeEvent,
  type CompositionEvent as ReactCompositionEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import styles from './EditorPage.module.css';
import { getPage, savePage, updateVolumeLastOpenedPage } from '../../lib/db';
import {
  LINES_PER_PAGE,
  PAGES_PER_VOLUME,
  SWIPE_THRESHOLD_PX,
} from '../../lib/constants';
import { splitAtLine30 } from '../../lib/pagination';
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
 * - ヘッダー: 左「本棚」/ 中央「‹ n / 50 ›」/ 右「設定」
 * - ページ遷移 (M5-T1/T2/T3/T5): 左右ボタン + 180ms フェード (--transition-page)
 *   + 左右スワイプ（B 案: textarea 上でも水平優位 2:1 のスワイプで反応, M8-2）
 *   + PageUp/PageDown キー（textarea にフォーカスがある時のみ）。
 *   遷移前に autosave flush + lastOpenedPage 更新。
 *
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
  // スワイプ開始座標 (M5-T3)
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  // textarea 参照（カーソル復元 M5-T4 用）
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // IME 変換中フラグ (M6-T2)。true の間は自動次ページ遷移を発動させない。
  const isComposingRef = useRef(false);
  // 自動遷移後、次ページでカーソルを overflow.length 位置に置くための pending 値 (M6-T3)。
  // null の間は通常のカーソル復元 (useEditorCursor) に任せる。
  const pendingCursorPosRef = useRef<number | null>(null);

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
      // M6-T3: 自動遷移直後はカーソルを overflow.length 位置（＝前ページから持ち越した文末）に置く。
      // useEditorCursor の復元より後に実行する必要があるため、microtask で textarea を直接操作する。
      if (pendingCursorPosRef.current != null) {
        const pos = pendingCursorPosRef.current;
        pendingCursorPosRef.current = null;
        requestAnimationFrame(() => {
          if (cancelled) return;
          const el = textareaRef.current;
          if (!el) return;
          el.focus();
          const clamped = Math.max(0, Math.min(pos, el.value.length));
          el.setSelectionRange(clamped, clamped);
        });
      }
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

  // カーソル復元 (M5-T4): ページ単位でスコープ化された localStorage キーを使う
  const { onSelectionChange } = useEditorCursor(
    textareaRef,
    text,
    ready,
    volumeId,
    current
  );

  /**
   * M6-T3: 30 行超過時の自動次ページ遷移。
   * - 現ページを keep で即時 savePage (flush 相当)
   * - 次ページ既存 content の先頭に overflow を prepend して savePage
   * - lastOpenedPage を next に更新し /book/:id/:next に navigate
   * - 遷移後、textarea にカーソル位置 `overflow.length` を復元する (pendingCursorPosRef)
   *
   * 呼び出しは `onChange`（composition 中でない時）と `onCompositionEnd` から。
   * 50 ページ目は T6.4 の onBeforeInput 側でロックされるためここでは発動させない。
   */
  const checkOverflowAndNavigate = useCallback(
    (value: string) => {
      if (!volumeId) return;
      if (current >= PAGES_PER_VOLUME) return; // T6.4 ロック対象は発動させない
      if (transitionLockRef.current) return;
      const { keep, overflow } = splitAtLine30(value);
      if (overflow.length === 0) return;

      transitionLockRef.current = true;
      const next = current + 1;
      // 遷移後の初期カーソルを overflow.length に置く（次ページ先頭から overflow 末尾）
      pendingCursorPosRef.current = overflow.length;
      // textarea 内容を即 keep に差し替える（autosave の再発火や fade 中の古い値の上書きを防ぐ）
      setText(keep);
      setFading(true);

      void (async () => {
        try {
          // 1) 現ページを keep で確定保存（autosave の debounce を待たない）
          await savePage(volumeId, current, keep);
          // 2) 次ページ既存 content を取得し、overflow を先頭に prepend
          const existingNext = await getPage(volumeId, next);
          const prevNextContent = existingNext?.content ?? '';
          const nextContent =
            prevNextContent.length === 0
              ? overflow
              : `${overflow}\n${prevNextContent}`;
          await savePage(volumeId, next, nextContent);
        } catch {
          // 保存失敗でも遷移は継続（次ページの useEffect で再ロードされる）
        }
        try {
          await updateVolumeLastOpenedPage(volumeId, next);
        } catch {
          // 握りつぶし
        }
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = setTimeout(() => {
          navigate(`/book/${volumeId}/${next}`);
        }, PAGE_FADE_MS);
      })();
    },
    [volumeId, current, navigate]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setText(value);
      const t = e.target as HTMLTextAreaElement;
      onSelectionChange(t.selectionStart ?? 0);
      // IME 変換中は自動遷移判定をスキップ (M6-T2)。
      // composition 終了時に onCompositionEnd から再判定する。
      if (isComposingRef.current) return;
      checkOverflowAndNavigate(value);
    },
    [onSelectionChange, checkOverflowAndNavigate]
  );

  const handleSelect = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const t = e.currentTarget;
      onSelectionChange(t.selectionStart ?? 0);
    },
    [onSelectionChange]
  );

  // M6-T2: IME (composition) ガード。
  // 変換中は自動遷移を抑止し、変換確定時に最新 value で再判定する。
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (e: ReactCompositionEvent<HTMLTextAreaElement>) => {
      isComposingRef.current = false;
      checkOverflowAndNavigate(e.currentTarget.value);
    },
    [checkOverflowAndNavigate]
  );

  /**
   * M6-T4: 50 ページ目末尾ロック。
   * 最終ページで overflow が発生する入力（改行・長文ペースト）を `onBeforeInput` で先読みキャンセル。
   * - 削除や 30 行以内の入力は素通り（overflow が発生しないので preventDefault しない）。
   * - IME 変換中（composition）は判定をスキップ（確定前の中間状態で誤判定しないため）。
   * - 静けさ原則: トースト・点滅・触覚フィードバックは出さない（AGENTS.md #17）。
   */
  const handleBeforeInput = useCallback(
    (e: FormEvent<HTMLTextAreaElement>) => {
      if (current !== PAGES_PER_VOLUME) return;
      if (isComposingRef.current) return;
      const el = e.currentTarget;
      // React の SyntheticInputEvent は `data` プロパティを（fallback で）持つ。
      // 型には無いので unknown 経由でアクセス。native InputEvent.data も fallback として読む。
      const syntheticData = (e as unknown as { data?: string | null }).data;
      const nativeData = (
        e as unknown as { nativeEvent?: { data?: string | null } }
      ).nativeEvent?.data;
      const raw =
        typeof syntheticData === 'string'
          ? syntheticData
          : typeof nativeData === 'string'
            ? nativeData
            : '';
      // keypress 由来で `\r` が返ってくるケース（Enter 押下）を `\n` として扱う
      const inserted = raw === '\r' ? '\n' : raw;
      // 削除系 inputType は data が null/空で overflow を増やさないので skip
      if (!inserted) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const nextValue =
        el.value.slice(0, start) + inserted + el.value.slice(end);
      // `overflow.length > 0` だと「30 行＋末尾改行」のケース (overflow="" だが lines=31) を
      // 取りこぼす。行数ベースで `> LINES_PER_PAGE` なら常にロック対象とする。
      if (nextValue.split('\n').length > LINES_PER_PAGE) {
        e.preventDefault();
      }
    },
    [current]
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

  /**
   * M7-T4: カーソル位置に今日の日付スタンプを挿入する。
   * - 挿入後は textarea の selectionRange をスタンプ末尾に移動
   * - state も即時に更新（onChange と同じ経路で IME ガード・自動遷移と協調）
   * - 挿入で 30 行を超えた場合は T6.3 の自動次ページ遷移ロジック
   *   (`checkOverflowAndNavigate`) を発火させる。
   */
  const insertDate = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const stamp = formatToday();
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const nextValue = el.value.slice(0, start) + stamp + el.value.slice(end);
    setText(nextValue);
    const nextPos = start + stamp.length;
    // DOM 反映後にカーソル位置を復元（React 19 でも rAF 1 フレーム必要）
    requestAnimationFrame(() => {
      const cur = textareaRef.current;
      if (!cur) return;
      cur.focus();
      const clamped = Math.max(0, Math.min(nextPos, cur.value.length));
      cur.setSelectionRange(clamped, clamped);
    });
    onSelectionChange(nextPos);
    // IME 変換中の日付挿入は想定外だが、compositionEnd での再判定に任せる。
    if (isComposingRef.current) return;
    checkOverflowAndNavigate(nextValue);
  }, [onSelectionChange, checkOverflowAndNavigate]);

  const canGoPrev = current > 1;
  const canGoNext = current < PAGES_PER_VOLUME;

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
        <Link to="/" aria-label="本棚に戻る" className="app-header-link">本棚</Link>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <button
            type="button"
            className={styles.headerDateButton}
            aria-label="今日の日付を挿入"
            onClick={insertDate}
          >
            <DateIcon />
          </button>
          <Link to="/settings" aria-label="設定" className="app-header-link">設定</Link>
        </div>
      </header>

      <div
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
          onBeforeInput={handleBeforeInput}
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
