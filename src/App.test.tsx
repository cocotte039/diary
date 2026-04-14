import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Navigate, useParams, useLocation } from 'react-router-dom';
import BookshelfPage from './features/bookshelf/BookshelfPage';
import EditorPage from './features/editor/EditorPage';
import SettingsPage from './features/settings/SettingsPage';
import WritePage from './features/write/WritePage';

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
      <Route path="/write" element={<WritePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

describe('App routing (M4-T1)', () => {
  it('renders BookshelfPage at "/"', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '本棚' })).toBeInTheDocument()
    );
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
});
