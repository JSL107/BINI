import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobCard } from './JobCard';
import type { Job } from '@bini/types';

vi.mock('./GameImage', () => ({
  GameImage: ({ query }: { query: string }) => (
    <div data-testid="game-image">{query}</div>
  ),
}));

const job: Job = {
  id: '278454',
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
};

describe('JobCard', () => {
  it('회사명과 제목을 렌더한다', () => {
    render(<JobCard job={job} />);
    expect(screen.getByText('게임듀오')).toBeInTheDocument();
    // 제목에만 고유한 부분으로 매칭 (모킹된 GameImage 텍스트와 겹치지 않도록)
    expect(screen.getByText(/배경 도트 디자이너/)).toBeInTheDocument();
  });

  it('공고 상세 링크를 건다', () => {
    render(<JobCard job={job} />);
    const link = screen.getByRole('link', { name: /배경 도트 디자이너/ });
    expect(link).toHaveAttribute('href', job.detailUrl);
  });

  it('imageQuery와 타입을 GameImage에 전달한다', () => {
    render(<JobCard job={job} />);
    expect(screen.getByTestId('game-image')).toHaveTextContent('p.일렌시아 게임');
  });

  it('태그를 모두 렌더한다', () => {
    render(<JobCard job={job} />);
    expect(screen.getByText('신입')).toBeInTheDocument();
    expect(screen.getByText('경기')).toBeInTheDocument();
  });
});
