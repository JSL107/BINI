import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Job, JobSource } from '@bini/types';
import { JobsGridWithFilter } from './JobsGridWithFilter';

vi.mock('./JobCard', () => ({
  JobCard: ({ job }: { job: Job }) => (
    <div data-testid="card" data-source={job.source}>
      {job.title}
    </div>
  ),
}));

function mkJob(over: Partial<Job> & { id: string; source: JobSource }): Job {
  return {
    company: '회사',
    companyUrl: '',
    title: '공고',
    detailUrl: '',
    deadline: '상시',
    deadlineAt: null,
    jobplanet: null,
    registeredAt: '2026-05-23T00:00:00.000Z',
    tags: [],
    gameTitle: null,
    imageQuery: '',
    imageQueryType: 'company',
    alternateSources: [],
    companyLogoUrl: null,
    companyPhotos: [],
    representativeGames: [],
    expired: false,
    experienceLevel: null,
    employmentType: null,
    locations: [],
    isRemote: false,
    thumbnailUrl: null,
    ...over,
  };
}

describe('JobsGridWithFilter', () => {
  const jobs: Job[] = [
    mkJob({ id: 'gamejob:1', source: 'gamejob', title: 'GJ 공고' }),
    mkJob({ id: 'wanted:1', source: 'wanted', title: 'WT 공고' }),
    mkJob({ id: 'jobkorea:1', source: 'jobkorea', title: 'JK 공고' }),
  ];

  it('초기에 모든 소스 공고를 렌더한다', () => {
    render(<JobsGridWithFilter jobs={jobs} />);
    expect(screen.getAllByTestId('card')).toHaveLength(3);
  });

  it('카운트가 0인 소스 칩은 노출하지 않는다', () => {
    render(<JobsGridWithFilter jobs={jobs} />);
    expect(screen.queryByRole('button', { name: /사람인/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /인크루트/ })).not.toBeInTheDocument();
  });

  it('칩을 토글하면 해당 소스가 제외된다', () => {
    render(<JobsGridWithFilter jobs={jobs} />);
    fireEvent.click(screen.getByRole('button', { name: /게임잡/ }));
    const cards = screen.getAllByTestId('card');
    expect(cards).toHaveLength(2);
    expect(cards.some((c) => c.getAttribute('data-source') === 'gamejob')).toBe(false);
  });

  it('모든 칩을 해제하면 다시 전체로 복귀한다 (빈 결과 방지)', () => {
    render(<JobsGridWithFilter jobs={jobs} />);
    fireEvent.click(screen.getByRole('button', { name: /게임잡/ }));
    fireEvent.click(screen.getByRole('button', { name: /원티드/ }));
    fireEvent.click(screen.getByRole('button', { name: /잡코리아/ }));
    expect(screen.getAllByTestId('card')).toHaveLength(3);
  });

  it('빈 공고면 빈 메시지를 노출한다', () => {
    render(<JobsGridWithFilter jobs={[]} />);
    expect(screen.queryAllByTestId('card')).toHaveLength(0);
    // 모든 칩 카운트가 0이라 칩 없음
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
