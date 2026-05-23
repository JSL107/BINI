import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('이전/다음 링크에 올바른 page 쿼리를 건다', () => {
    render(<Pagination page={3} totalPages={5} />);
    expect(screen.getByRole('link', { name: '이전' })).toHaveAttribute('href', '/?page=2');
    expect(screen.getByRole('link', { name: '다음' })).toHaveAttribute('href', '/?page=4');
  });

  it('첫 페이지에서는 이전 링크를 렌더하지 않는다', () => {
    render(<Pagination page={1} totalPages={5} />);
    expect(screen.queryByRole('link', { name: '이전' })).toBeNull();
  });

  it('마지막 페이지에서는 다음 링크를 렌더하지 않는다', () => {
    render(<Pagination page={5} totalPages={5} />);
    expect(screen.queryByRole('link', { name: '다음' })).toBeNull();
  });

  it('현재 페이지/전체 페이지를 표시한다', () => {
    render(<Pagination page={3} totalPages={5} />);
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
  });

  it('search가 주어지면 페이지 링크에 q 파라미터를 보존한다', () => {
    render(<Pagination page={2} totalPages={5} search="원화" />);
    expect(screen.getByRole('link', { name: '이전' })).toHaveAttribute(
      'href',
      '/?page=1&q=%EC%9B%90%ED%99%94',
    );
    expect(screen.getByRole('link', { name: '다음' })).toHaveAttribute(
      'href',
      '/?page=3&q=%EC%9B%90%ED%99%94',
    );
  });
});
