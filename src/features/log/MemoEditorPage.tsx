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
 * - 罫線なしプレーン textarea（日記=罫線ノート / メモ=素の紙で体験分離）。
 * - 自動フォーカスなし（マウント時 focus しない, 静けさ）。
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

  const onCreated = useCallback(
    (id: string) => {
      // 初回保存で URL を /log/:id に置換（戻る履歴を汚さない）
      navigate(`/log/${id}`, { replace: true });
    },
    [navigate]
  );

  // autosave 配線（本番コードパス）。ready 前は null content で no-op。
  const { flush } = useMemoAutoSave(
    memoId,
    ready ? content : '',
    onCreated
  );

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

  // 戻るリンク: 既定遷移をキャンセルし flush してから navigate
  const handleBack = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      void (async () => {
        try {
          await flush();
        } catch {
          // 保存失敗でも遷移は継続
        }
        navigate(backTo);
      })();
    },
    [flush, navigate, backTo]
  );

  return (
    <div className={styles.root} data-testid="memo-editor-page">
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
          data-testid="memo-textarea"
          className={styles.textarea}
          value={content}
          onChange={handleChange}
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
