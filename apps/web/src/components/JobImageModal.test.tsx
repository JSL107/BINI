// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { JobImageModal } from './JobImageModal';

describe('JobImageModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('open=false면 모달 미렌더', () => {
    render(
      <JobImageModal
        open={false}
        gameImages={['https://example.com/a.jpg']}
        companyPhotos={[]}
        initialUrl={null}
        alt="t"
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId('image-modal')).toBeNull();
  });

  it('백드롭 클릭 시 onClose 호출', () => {
    const onClose = vi.fn();
    render(
      <JobImageModal
        open
        gameImages={['https://example.com/a.jpg']}
        companyPhotos={[]}
        initialUrl={null}
        alt="t"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('image-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('initialUrl이 companyPhotos에 있으면 회사 탭으로 시작', () => {
    render(
      <JobImageModal
        open
        gameImages={['https://example.com/g.jpg']}
        companyPhotos={['https://example.com/c.jpg']}
        initialUrl="https://example.com/c.jpg"
        alt="t"
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('tab', { name: /회사 사진/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('Esc 키 누르면 onClose 호출', () => {
    const onClose = vi.fn();
    render(
      <JobImageModal
        open
        gameImages={['https://example.com/a.jpg']}
        companyPhotos={[]}
        initialUrl={null}
        alt="t"
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('open=true 동안 body scroll lock, unmount 시 복원', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = render(
      <JobImageModal
        open
        gameImages={['https://example.com/a.jpg']}
        companyPhotos={[]}
        initialUrl={null}
        alt="t"
        onClose={() => {}}
      />,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('"잘못된 이미지 신고" 버튼이 현재 url로 onReportBad 호출 + 백드롭 전파 차단', () => {
    const onReportBad = vi.fn();
    const onClose = vi.fn();
    render(
      <JobImageModal
        open
        gameImages={['https://example.com/a.jpg']}
        companyPhotos={[]}
        initialUrl="https://example.com/a.jpg"
        alt="t"
        onClose={onClose}
        onReportBad={onReportBad}
      />,
    );
    fireEvent.click(screen.getByTestId('report-bad-image-modal'));
    expect(onReportBad).toHaveBeenCalledTimes(1);
    expect(onReportBad).toHaveBeenCalledWith('https://example.com/a.jpg');
    // 신고 버튼 클릭이 백드롭으로 새 onClose를 트리거하면 안 된다.
    expect(onClose).not.toHaveBeenCalled();
  });
});
