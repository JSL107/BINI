import { toJobDto } from './job-dto';

describe('toJobDto', () => {
  const baseRow = {
    id: 'gamejob:1',
    source: 'gamejob',
    company: '테스트회사',
    companyUrl: 'https://co',
    title: '원화가 채용',
    detailUrl: 'https://detail',
    deadline: '상시',
    registeredAt: new Date('2026-01-01T00:00:00Z'),
    tags: [],
    gameTitle: null,
    imageQuery: '',
    imageQueryType: 'company',
    companyLogoUrl: null,
    companyPhotos: [],
    representativeGames: [],
  };

  it('thumbnailUrl 인자를 그대로 매핑한다', () => {
    const job = toJobDto(baseRow, [], null, 'https://img/thumb.jpg');
    expect(job.thumbnailUrl).toBe('https://img/thumb.jpg');
  });

  it('thumbnailUrl 미지정 시 null (priority 아닌 카드/회사 페이지 경로)', () => {
    const job = toJobDto(baseRow);
    expect(job.thumbnailUrl).toBeNull();
  });
});
