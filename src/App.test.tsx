import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
  Navigate,
  useParams,
  useLocation,
} from 'react-router-dom';
import App from './App';
import BookshelfPage from './features/bookshelf/BookshelfPage';
import EditorPage from './features/editor/EditorPage';
import SettingsPage from './features/settings/SettingsPage';
import * as github from './lib/github';

// GitHub 同期は本テストの対象外なのでモック
vi.mock('./lib/github', () => ({
  syncPendingPagesBackground: vi.fn(),
  syncPendingMemosBackground: vi.fn(),
  registerOnlineSync: vi.fn(() => () => {}),
  importFromGitHub: vi.fn(),
  syncPendingPages: vi.fn(),
  testConnection: vi.fn(),
}));

/**
 * ReadRedirect は App.tsx 内部の小関数だが、テストのためルート構造を複製する。
 * 実本体と同じふるまいになるよう合わせて変更すること。
 */
function ReadRedirect() {
  const { volumeId, pageNumber } = useParams();
  if (!volumeId || !pageNumber) return <Navigate to="/" replace />;
  return <Navigate to={`/book/${volumeId}/${pageNumber}`} replace />;
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<BookshelfPage />} />
      <Route path="/book/:volumeId/:pageNumber" element={<EditorPage />} />
      <Route path="/read/:volumeId/:pageNumber" element={<ReadRedirect />} />
      <Route path="/bookshelf" element={<Navigate to="/" replace />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

describe('App routing (M4-T1 / M7-T5)', () => {
  it('renders BookshelfPage at "/"', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    );
    // M3-T2: BookshelfPage の h1「本棚」は HeaderTabs に置換された。
    // 旧 h1 アサーションを HeaderTabs の表示確認に更新（plan/spec 明示の回帰更新）。
    await waitFor(() =>
      expect(screen.getByRole('link', { name: '本棚' })).toBeInTheDocument()
    );
    expect(screen.getByRole('link', { name: 'メモ' })).toBeInTheDocument();
  });

  it('renders EditorPage at "/book/:volumeId/:pageNumber"', () => {
    render(
      <MemoryRouter initialEntries={['/book/v1/3']}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(screen.getByTestId('editor-page')).toBeInTheDocument();
  });

  it('redirects /read/:id/:page to /book/:id/:page', () => {
    render(
      <MemoryRouter initialEntries={['/read/abc/3']}>
        <>
          <AppRoutes />
          <LocationProbe />
        </>
      </MemoryRouter>
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/book/abc/3');
    expect(screen.getByTestId('editor-page')).toBeInTheDocument();
  });

  it('redirects /bookshelf to /', async () => {
    render(
      <MemoryRouter initialEntries={['/bookshelf']}>
        <>
          <AppRoutes />
          <LocationProbe />
        </>
      </MemoryRouter>
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('falls back unknown paths to /', () => {
    render(
      <MemoryRouter initialEntries={['/no/such/route']}>
        <>
          <AppRoutes />
          <LocationProbe />
        </>
      </MemoryRouter>
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  // M7-T5: 旧 /write URL も path="*" で / (本棚) にフォールバックする
  it('falls back removed /write path to /', () => {
    render(
      <MemoryRouter initialEntries={['/write']}>
        <>
          <AppRoutes />
          <LocationProbe />
        </>
      </MemoryRouter>
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });
});

describe('App 起動時 GitHub 再同期配線（registerOnlineSync 復旧）', () => {
  it('マウントで registerOnlineSync を登録し pages/memos の起動時フラッシュを呼ぶ', async () => {
    vi.mocked(github.registerOnlineSync).mockClear();
    vi.mocked(github.syncPendingPagesBackground).mockClear();
    vi.mocked(github.syncPendingMemosBackground).mockClear();

    render(<App />);

    await waitFor(() => {
      expect(github.registerOnlineSync).toHaveBeenCalledTimes(1);
    });
    expect(github.syncPendingPagesBackground).toHaveBeenCalledTimes(1);
    expect(github.syncPendingMemosBackground).toHaveBeenCalledTimes(1);
  });

  it('アンマウントで registerOnlineSync の解除関数を呼ぶ（リスナー解放）', async () => {
    const unregister = vi.fn();
    vi.mocked(github.registerOnlineSync).mockReturnValueOnce(unregister);

    const { unmount } = render(<App />);
    await waitFor(() =>
      expect(github.registerOnlineSync).toHaveBeenCalled()
    );
    unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
  });
});
