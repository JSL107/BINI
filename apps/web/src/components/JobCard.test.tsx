import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobCard } from './JobCard';
import type { Job } from '@bini/types';

vi.mock('./JobImageCarousel', () => ({
  JobImageCarousel: ({ jobId }: { jobId: string }) => (
    <div data-testid="carousel">{jobId}</div>
  ),
}));

vi.mock('./CompanyAvatar', () => ({
  CompanyAvatar: ({ name, logoUrl }: { name: string; logoUrl: string | null }) => (
    <div data-testid="avatar" data-logo={logoUrl ?? ''}>{name}</div>
  ),
}));

const baseJob: Job = {
  id: '278454',
  source: 'gamejob' as const,
  company: '게임듀오',
  companyUrl: 'https://www.gamejob.co.kr/Company/Detail?M=1',
  title: '[p.일렌시아] 배경 도트 디자이너',
  detailUrl: 'https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=278454',
  deadline: '상시',
  registeredAt: '2026-05-22T08:00:00.000Z',
  tags: ['신입', '경기'],
  gameTitle: 'p.일렌시아',
  imageQuery: 'p.일렌시아 게임',
  imageQueryType: 'game',
  alternateSources: [],
  companyLogoUrl: null,
  companyPhotos: [],
  representativeGames: [],
};

describe('JobCard', () => {
  it('회사명과 제목을 렌더한다', () => {
    render(<JobCard job={baseJob} />);
    // 회사명은 아바타(mock)와 헤더 텍스트 양쪽에 나타날 수 있어 getAllBy 사용
    expect(screen.getAllByText('게임듀오').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/배경 도트 디자이너/)).toBeInTheDocument();
  });

  it('공고 상세 링크를 건다', () => {
    render(<JobCard job={baseJob} />);
    expect(screen.getByRole('link', { name: /배경 도트 디자이너/ })).toHaveAttribute(
      'href',
      baseJob.detailUrl,
    );
  });

  it('jobId를 JobImageCarousel에 전달한다', () => {
    render(<JobCard job={baseJob} />);
    expect(screen.getByTestId('carousel')).toHaveTextContent('278454');
  });

  it('CompanyAvatar에 logoUrl과 회사명을 전달한다', () => {
    render(<JobCard job={{ ...baseJob, companyLogoUrl: 'https://logo/example.png' }} />);
    const avatar = screen.getByTestId('avatar');
    expect(avatar).toHaveTextContent('게임듀오');
    expect(avatar.getAttribute('data-logo')).toBe('https://logo/example.png');
  });

  it('태그를 모두 렌더한다', () => {
    render(<JobCard job={baseJob} />);
    expect(screen.getByText('신입')).toBeInTheDocument();
    expect(screen.getByText('경기')).toBeInTheDocument();
  });
});
