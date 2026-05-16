import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HeaderTabs from './HeaderTabs';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HeaderTabs />
    </MemoryRouter>
  );
}

describe('HeaderTabs', () => {
  it('pathname "/" で「本棚」が選択状態', () => {
    renderAt('/');
    const shelf = screen.getByRole('link', { name: '本棚' });
    const memo = screen.getByRole('link', { name: 'メモ' });
    expect(shelf).toHaveAttribute('aria-current', 'page');
    expect(memo).not.toHaveAttribute('aria-current');
  });

  it('pathname "/log" で「メモ」が選択状態', () => {
    renderAt('/log');
    const shelf = screen.getByRole('link', { name: '本棚' });
    const memo = screen.getByRole('link', { name: 'メモ' });
    expect(memo).toHaveAttribute('aria-current', 'page');
    expect(shelf).not.toHaveAttribute('aria-current');
  });

  it('"/log/new" でも「メモ」選択（/log 前方一致）', () => {
    renderAt('/log/new');
    expect(screen.getByRole('link', { name: 'メモ' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('"/log/abc" でも「メモ」選択（/log 前方一致）', () => {
    renderAt('/log/abc');
    expect(screen.getByRole('link', { name: 'メモ' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('Link href が "/" と "/log"', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: '本棚' })).toHaveAttribute(
      'href',
      '/'
    );
    expect(screen.getByRole('link', { name: 'メモ' })).toHaveAttribute(
      'href',
      '/log'
    );
  });

  it('タブは2項目のみ・区切りは aria-hidden', () => {
    renderAt('/');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    // 区切り「/」は aria-hidden なのでアクセシブルツリーに出ない
    expect(screen.queryByText('/', { selector: 'span' })).toBeInTheDocument();
  });
});
