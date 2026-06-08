import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ChangeEvent,
} from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import styles from './MemoEditorPage.module.css';
import { getMemo } from '../../lib/db';
import { SWIPE_THRESHOLD_PX } from '../../lib/constants';
import { useMemoAutoSave } from './useMemoAutoSave';

/**
 * Memo.createdAt(ISO) を `YYYY/MM/DD HH:MM`（ローカル時刻）に整形する。
 * 編集時にヘッダー右へ控えめ表示する用途のみ（opacity 0.3）。
 */
export function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

/**
 * MemoEditorPage: 新規(/log/new)・編集(/log/:memoId) 兼用のメモ入力画面。
 *
 * - ユーザー要望により日記と体験統一（Klee One＋罫線, notebook クラス流用）。
 *   自由高さは維持（メモにページ概念は導入しない）。
 * - ready 後 textarea を自動フォーカス（書く所作の摩擦最小化）。編集時はカーソル末尾。
 * - 暗黙保存（useMemoAutoSave, 2 秒 debounce）。保存ボタン/トースト/件数なし。
 * - 編集時は getMemo で content をロード。undefined（削除済み/不正 id）は
 *   /log へ replace 遷移（幽霊メモ回避, E10）。
 * - 戻るリンク/popstate で flush してから遷移（直近入力をロストしない, E7）。
 *   popstate ガードは EditorPage と同型（StrictMode 二重 pushState 防止 ref）。
 */
export default function MemoEditorPage() {
  const params = useParams<{ memoId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const memoId = params.memoId ?? null;
  const isNew = memoId === null;

  const [content, setContent] = useState('');
  const [ready, setReady] = useState(false);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  // 戻り先: 新規=遷移元(location.state.from)または既定 '/'、編集=一覧 '/log'
  const fromState =
    (location.state as { from?: string } | null)?.from ?? '/';
  const backTo = isNew ? fromState : '/log';

  // StrictMode 二重 pushState を防ぐ ref（EditorPage 同型）
  const historyGuardInstalledRef = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 右スワイプ判定用（EditorPage 同型・コピー実装）。IME 変換中ガード ref。
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);

  // 編集時: 既存メモをロード。undefined は /log へ replace（E10）。
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      if (memoId === null) {
        if (!cancelled) {
          setContent('');
          setCreatedAt(null);
          setReady(true);
        }
        return;
      }
      const memo = await getMemo(memoId);
      if (cancelled) return;
      if (!memo) {
        navigate('/log', { replace: true });
        return;
      }
      setContent(memo.content);
      setCreatedAt(memo.createdAt);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [memoId, navigate]);

  // ready 後に textarea を自動フォーカス（書く所作の摩擦最小化）。
  // 編集時はカーソルを content 末尾へ。content 依存にしない
  // （入力毎の再フォーカス防止）。
  useEffect(() => {
    if (!ready) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus({ preventScroll: true }); // M3: スクロール飛び抑制
    if (!isNew && content.length > 0) {
      // M4: 編集時カーソル末尾
      ta.setSelectionRange(content.length, content.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isNew]);

  const onCreated = useCallback(
    (id: string) => {
      // 初回保存で URL を /log/:id に置換（戻る履歴を汚さない）
      navigate(`/log/${id}`, { replace: true });
    },
    [navigate]
  );

  // autosave 配線（本番コードパス）。ready 前は enabled=false でフック側が一切保存しない
  // （ロード中の空 content で既存メモを上書きしない／背面化 flush も発火しない）。
  const { flush } = useMemoAutoSave(memoId, content, onCreated, ready);

  // popstate ガード（Android 戻る等）: flush → backTo へ replace 遷移
  useEffect(() => {
    if (!historyGuardInstalledRef.current) {
      window.history.pushState({ memoEditorGuard: true }, '');
      historyGuardInstalledRef.current = true;
    }
    const onPopState = () => {
      void flush().catch(() => {});
      navigate(backTo, { replace: true });
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [flush, navigate, backTo]);

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  }, []);

  // 共通の戻り処理: flush（直近入力をロストしない, C2）してから navigate。
  // 戻るリンク click と右スワイプの両方から呼ばれる（dead code なし）。
  const goBack = useCallback(async () => {
    try {
      await flush();
    } catch {
      // 保存失敗でも遷移は継続
    }
    navigate(backTo);
  }, [flush, navigate, backTo]);

  // 戻るリンク: 既定遷移をキャンセルし goBack へ委譲
  const handleBack = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      void goBack();
    },
    [goBack]
  );

  // 右エッジスワイプで戻る（EditorPage L291-331 同型のコピー実装）。
  // textarea は ref で onTouchStart を発火しないため target は root か textarea。
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    touchStartXRef.current = t ? t.clientX : null;
    touchStartYRef.current = t ? t.clientY : null;
  };
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const sx = touchStartXRef.current;
    const sy = touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (sx == null || sy == null) return;
    if (isComposingRef.current) return; // M1: IME 変換中は無効
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dx) <= Math.abs(dy) * 2) return; // 水平優位 2:1
    if (dx > 0) void goBack(); // 右スワイプ → 戻る（C2: goBack が flush）
    // 左スワイプは無反応（メモ 1 画面）
  };

  return (
    <div
      className={styles.root}
      data-testid="memo-editor-page"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <header className={`app-header ${styles.header}`}>
        <div className={styles.headerLeft}>
          <Link
            to={backTo}
            aria-label="戻る"
            className="app-header-link"
            onClick={handleBack}
          >
            戻る
          </Link>
        </div>
        <div className={styles.headerRight}>
          {!isNew && createdAt && (
            <span
              className={styles.createdAt}
              data-testid="memo-created-at"
            >
              {formatCreatedAt(createdAt)}
            </span>
          )}
        </div>
      </header>

      <div className={styles.surface}>
        <textarea
          ref={textareaRef}
          data-testid="memo-textarea"
          className={`notebook-surface notebook-textarea ${styles.textarea}`}
          value={content}
          onChange={handleChange}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="メモ本文"
        />
      </div>
    </div>
  );
}
