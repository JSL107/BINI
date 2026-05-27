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
  deadlineAt: null,
  jobplanet: null,
  registeredAt: '2026-05-22T08:00:00.000Z',
  tags: ['신입', '경기'],
  gameTitle: 'p.일렌시아',
  imageQuery: 'p.일렌시아 게임',
  imageQueryType: 'game',
  alternateSources: [],
  companyLogoUrl: null,
  companyPhotos: [],
  representativeGames: [],
  expired: false,
  experienceLevel: null,
  employmentType: null,
  locations: [],
  isRemote: false,
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

  describe('source badge', () => {
    it('renders the wanted source label', () => {
      const job: Job = { ...baseJob, source: 'wanted' as const };
      render(<JobCard job={job} />);
      expect(screen.getByText(/원티드/i)).toBeInTheDocument();
    });

    it('renders the gamejob source label by default', () => {
      const job: Job = { ...baseJob, source: 'gamejob' as const };
      render(<JobCard job={job} />);
      expect(screen.getByText(/게임잡/i)).toBeInTheDocument();
    });

    it('renders the jobkorea source label', () => {
      const job: Job = { ...baseJob, source: 'jobkorea' as const };
      render(<JobCard job={job} />);
      expect(screen.getByText(/잡코리아/i)).toBeInTheDocument();
    });

    it('renders the saramin source label', () => {
      const job: Job = { ...baseJob, source: 'saramin' as const };
      render(<JobCard job={job} />);
      expect(screen.getByText(/사람인/i)).toBeInTheDocument();
    });

    it('renders the incruit source label', () => {
      const job: Job = { ...baseJob, source: 'incruit' as const };
      render(<JobCard job={job} />);
      expect(screen.getByText(/인크루트/i)).toBeInTheDocument();
    });

    it('renders +N alternateSources count when present', () => {
      const job: Job = {
        ...baseJob,
        source: 'gamejob' as const,
        alternateSources: [{ source: 'wanted' as const, detailUrl: 'https://wt/1' }],
      };
      render(<JobCard job={job} />);
      expect(screen.getByText(/\+1/)).toBeInTheDocument();
    });

    it('does not render +N when alternateSources is empty', () => {
      const job: Job = {
        ...baseJob,
        source: 'gamejob' as const,
        alternateSources: [],
      };
      render(<JobCard job={job} />);
      expect(screen.queryByText(/\+\d+/)).not.toBeInTheDocument();
    });
  });

  describe('jobplanet 평판', () => {
    it('jobplanet이 null이면 검색 링크(잡플래닛 ↗) 폴백', () => {
      render(<JobCard job={baseJob} />);
      const link = screen.getByText(/잡플래닛 ↗/);
      expect(link).toBeInTheDocument();
      expect(link.closest('a')?.getAttribute('href')).toMatch(/jobplanet\.co\.kr\/search/);
    });

    it('rating이 있으면 별점 뱃지로 노출(검색 링크 대신)', () => {
      const job: Job = {
        ...baseJob,
        jobplanet: {
          url: 'https://www.jobplanet.co.kr/companies/12345',
          rating: 4.3,
          reviewCount: 128,
          salaryAvg: 5200,
          fetchedAt: '2026-05-26T00:00:00.000Z',
        },
      };
      render(<JobCard job={job} />);
      expect(screen.getByText(/★\s*4\.3/)).toBeInTheDocument();
      expect(screen.getByText(/\(128\)/)).toBeInTheDocument();
      // 검색 폴백 링크는 같이 뜨지 않는다(중복 방지)
      expect(screen.queryByText(/잡플래닛 ↗/)).not.toBeInTheDocument();
    });

    it('rating은 있고 url은 null이면 검색 URL을 폴백 href로 사용', () => {
      const job: Job = {
        ...baseJob,
        jobplanet: {
          url: null,
          rating: 3.9,
          reviewCount: null,
          salaryAvg: null,
          fetchedAt: '2026-05-26T00:00:00.000Z',
        },
      };
      render(<JobCard job={job} />);
      const badge = screen.getByText(/★\s*3\.9/);
      expect(badge.closest('a')?.getAttribute('href')).toMatch(
        /jobplanet\.co\.kr\/search/,
      );
    });

    it('reviewCount가 null이면 (n) 표시는 생략', () => {
      const job: Job = {
        ...baseJob,
        jobplanet: {
          url: 'https://www.jobplanet.co.kr/companies/999',
          rating: 4.5,
          reviewCount: null,
          salaryAvg: null,
          fetchedAt: '2026-05-26T00:00:00.000Z',
        },
      };
      render(<JobCard job={job} />);
      expect(screen.getByText(/★\s*4\.5/)).toBeInTheDocument();
      expect(screen.queryByText(/\(0\)|\(null\)/)).not.toBeInTheDocument();
    });
  });
});
