import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { JobCard } from './JobCard';
import type { Job } from '@bini/types';
import { STORAGE_KEY as SEEN_STORAGE_KEY } from '../lib/seen-jobs';

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

// SaveJobButton은 자체 localStorage + useEffect를 갖고 있어 JobCard 단위 테스트엔
// 격리한다. 자체 spec(SaveJobButton.test.tsx)에서 본 책임을 검증.
vi.mock('./SaveJobButton', () => ({
  SaveJobButton: () => <div data-testid="save-button-stub" />,
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
    it('jobplanet이 null이면 별점 뱃지/검색 폴백 모두 미노출(카드 잡음 감소)', () => {
      render(<JobCard job={baseJob} />);
      expect(screen.queryByText(/잡플래닛 ↗/)).not.toBeInTheDocument();
      expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    });

    it('rating이 있으면 별점 뱃지로 노출', () => {
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

  describe('expired 카드 opacity 위치', () => {
    // 회귀: 이전엔 article 전체에 opacity-60을 걸어 이미지 자식(JobImageCarousel)
    // 까지 흐릿했고, 그 안에서 띄우는 사진 확대 모달(JobImageModal)도 CSS
    // opacity cascade로 흐려졌다. opacity는 본문 텍스트 영역에만 적용돼야 한다.
    //
    // root cause는 단지 'opacity-60' 클래스가 아니라 "fixed descendant에 cascade될 수
    // 있는 모든 CSS property"이다. 미래에 누군가 ancestor에 filter/transform/isolation
    // 같은 stacking-context property를 추가해도 동일 버그가 재발한다. 그래서 회귀 검증을
    // opacity 단일 토큰이 아니라 cascade-bearing className regex로 일반화한다.
    const CASCADE_RISK_RE =
      /(^|\s)(opacity-|filter\b|backdrop-filter\b|transform\b|scale-|rotate-|translate-|skew-|blur-|isolate\b|will-change-)/;

    function hasCascadeRiskAncestor(el: Element | null): boolean {
      let cur: Element | null = el?.parentElement ?? null;
      while (cur) {
        const cls = cur.getAttribute('class') ?? '';
        if (CASCADE_RISK_RE.test(cls)) return true;
        cur = cur.parentElement;
      }
      return false;
    }

    it('expired=true여도 article element 자체엔 opacity/filter/transform/isolation 류 클래스가 없다', () => {
      const job: Job = { ...baseJob, expired: true };
      const { container } = render(<JobCard job={job} />);
      const article = container.querySelector('article');
      expect(article).not.toBeNull();
      expect(CASCADE_RISK_RE.test(article!.className)).toBe(false);
    });

    it('expired=true면 본문(텍스트) 영역에만 opacity-60', () => {
      const job: Job = { ...baseJob, expired: true };
      render(<JobCard job={job} />);
      // 본문 영역엔 제목 링크가 있으므로 그 ancestor 중 opacity-60 element가 1개 잡혀야 한다.
      const titleLink = screen.getByRole('link', { name: /배경 도트 디자이너/ });
      expect(titleLink.closest('.opacity-60')).not.toBeNull();
    });

    it('expired=true에도 이미지 영역(carousel)의 어떤 ancestor에도 cascade-bearing CSS가 없다', () => {
      // 핵심 회귀: carousel의 DOM 조상 어디에도 opacity/filter/transform/isolation 등
      // stacking-context를 만드는 처리가 없어야 fixed descendant(JobImageModal)가 정상이다.
      const job: Job = { ...baseJob, expired: true };
      render(<JobCard job={job} />);
      const carousel = screen.getByTestId('carousel');
      expect(hasCascadeRiskAncestor(carousel)).toBe(false);
    });

    it('expired=false면 본문에도 opacity 없음', () => {
      render(<JobCard job={baseJob} />);
      const titleLink = screen.getByRole('link', { name: /배경 도트 디자이너/ });
      expect(titleLink.closest('.opacity-60')).toBeNull();
    });
  });

  describe('본적있음 뱃지', () => {
    beforeEach(() => {
      window.localStorage.clear();
    });
    afterEach(() => {
      window.localStorage.clear();
    });

    it('localStorage에 없으면 뱃지 미표시', () => {
      render(<JobCard job={baseJob} />);
      expect(screen.queryByText('본적있음')).not.toBeInTheDocument();
    });

    it('localStorage에 jobId가 있으면 뱃지 표시', () => {
      window.localStorage.setItem(
        SEEN_STORAGE_KEY,
        JSON.stringify({ [baseJob.id]: Date.now() }),
      );
      render(<JobCard job={baseJob} />);
      expect(screen.getByText('본적있음')).toBeInTheDocument();
    });

    it('상세 링크 클릭 시 localStorage에 jobId가 기록됨', () => {
      render(<JobCard job={baseJob} />);
      const titleLink = screen.getByRole('link', { name: /배경 도트 디자이너/ });
      fireEvent.click(titleLink);
      const stored = JSON.parse(window.localStorage.getItem(SEEN_STORAGE_KEY) ?? '{}');
      expect(stored[baseJob.id]).toBeTypeOf('number');
    });

    it('다른 jobId만 저장돼 있으면 본 카드엔 뱃지 없음(false-positive 방지)', () => {
      window.localStorage.setItem(
        SEEN_STORAGE_KEY,
        JSON.stringify({ 'gamejob:999999': Date.now() }),
      );
      render(<JobCard job={baseJob} />);
      expect(screen.queryByText('본적있음')).not.toBeInTheDocument();
    });
  });
});
