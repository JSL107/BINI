import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadGatewayException } from '@nestjs/common';
import {
  GamejobScraperService,
  ART_DUTY_CODES,
} from './gamejob-scraper.service';

const html = readFileSync(
  join(__dirname, '../../test/fixtures/gamejob-wonhwa-list.html'),
  'utf-8',
);

const okResponse = (body: string): Response =>
  ({ ok: true, status: 200, text: async () => body }) as unknown as Response;

/** 실제 게임잡 목록 마크업(table.tblList > tbody > tr)을 그대로 축소한 1건짜리 행을 만든다. */
const buildListHtml = (row: {
  giNo: string;
  title: string;
  company: string;
  families: string;
}): string => `
  <table class="tblList">
    <tbody>
      <tr>
        <td>
          <div class="company noLogo">
            <a href="/Company/Detail?tabcode=1&amp;M=1"><strong>${row.company}</strong></a>
          </div>
        </td>
        <td>
          <div class="tit">
            <a href="/Recruit/GI_Read/View?GI_No=${row.giNo}" onclick="GA_Application_Prdt('02_공고클릭', 'N', '${row.title}', '${row.giNo}', '${row.company}', '없음', IsNullOrWhiteSpace('${row.families}'), IsNullOrWhiteSpace('모바일게임'), '없음', IsNullOrWhiteSpace('서울'));" target="_blank"><strong>${row.title}</strong></a>
          </div>
        </td>
        <td><span class="date">상시</span><span class="modifyDate">1일 전 등록</span></td>
      </tr>
    </tbody>
  </table>
`;

/** duty 코드별로 서로 다른 GI_No·직군 라벨을 단 공고를 응답으로 준다. */
const htmlByDuty: Record<string, string> = {
  '5': buildListHtml({
    giNo: '90001',
    title: '테스트공고 원화',
    company: '컴퍼니A',
    families: '원화',
  }),
  '6': buildListHtml({
    giNo: '90002',
    title: '테스트공고 모델링',
    company: '컴퍼니B',
    families: '원화, 모델링',
  }),
  '7': buildListHtml({
    giNo: '90003',
    title: '테스트공고 애니메이션',
    company: '컴퍼니C',
    families: '애니메이션',
  }),
  '8': buildListHtml({
    giNo: '90004',
    title: '테스트공고 이펙트',
    company: '컴퍼니D',
    families: '이펙트·FX',
  }),
};

const respondByRequestedDuty = (init: unknown): Response => {
  const body = String((init as RequestInit).body);
  const match = body.match(/condition%5Bduty%5D=(\d+)/);
  const duty = match?.[1] ?? '';
  return okResponse(htmlByDuty[duty] ?? '<html></html>');
};

describe('GamejobScraperService', () => {
  let service: GamejobScraperService;
  let calls: string[];

  beforeEach(() => {
    service = new GamejobScraperService();
    calls = [];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('아트 4개 직군을 요청한다', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      calls.push(String((init as RequestInit).body));
      return Promise.resolve(okResponse(html));
    });

    await service.fetchJobList(1);

    expect(calls.length).toBe(4);
    expect(ART_DUTY_CODES).toEqual(['5', '6', '7', '8']);
    for (const code of ART_DUTY_CODES) {
      expect(
        calls.some((body) => body.includes(`condition%5Bduty%5D=${code}`)),
      ).toBe(true);
    }
  });

  it('직군 간 중복 공고를 GI_No 로 합친다', async () => {
    // 4회 모두 같은 픽스처(40건) → 병합 후에도 40건이어야 한다.
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse(html));

    const result = await service.fetchJobList(1);

    expect(result.jobs.length).toBe(40);
    const ids = result.jobs.map((j) => j.sourceId);
    expect(new Set(ids).size).toBe(40);
  });

  it('한 직군이 실패해도 나머지 결과를 돌려준다', async () => {
    let n = 0;
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      n += 1;
      if (n === 2) return Promise.reject(new Error('timeout'));
      return Promise.resolve(okResponse(html));
    });

    const result = await service.fetchJobList(1);

    expect(result.jobs.length).toBe(40);
  });

  it('전 직군이 실패하면 예외를 던진다', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('down'));

    await expect(service.fetchJobList(1)).rejects.toThrow();
  });

  it('전 직군이 0건이면 구조 변경으로 보고 예외를 던진다', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse('<html></html>'));

    await expect(service.fetchJobList(1)).rejects.toThrow(/구조 변경/);
  });

  it('일부 직군만 0건인 것은 정상으로 본다', async () => {
    let n = 0;
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      n += 1;
      return Promise.resolve(okResponse(n === 1 ? html : '<html></html>'));
    });

    const result = await service.fetchJobList(1);

    expect(result.jobs.length).toBe(40);
  });

  it('일부 직군은 실패하고 나머지는 0건이면 구조 변경이 아니라 실패한 직군을 알린다', async () => {
    // duty 7·8 은 네트워크 실패, duty 5·6 은 요청은 성공했지만 파싱 결과가 0건.
    // 두 원인이 섞였으므로 "구조 변경 의심"을 단정하면 안 되고, 실패한 duty 를 짚어야 한다.
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      const body = String((init as RequestInit).body);
      const isFailingDuty =
        body.includes('condition%5Bduty%5D=7') ||
        body.includes('condition%5Bduty%5D=8');
      if (isFailingDuty) return Promise.reject(new Error('timeout'));
      return Promise.resolve(okResponse('<html></html>'));
    });

    let thrown: unknown;
    try {
      await service.fetchJobList(1);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadGatewayException);
    const message = (thrown as BadGatewayException).message;
    expect(message).not.toMatch(/구조 변경/);
    expect(message).toContain('7');
    expect(message).toContain('8');
  });

  it('직군마다 다른 공고가 와도 GI_No 로 구분해 합치고 직군 라벨은 공고 자신의 값을 쓴다', async () => {
    // duty=6 으로 받은 공고가 스스로 ['원화','모델링']을 달고 있으면, 요청한 duty
    // 코드(6→모델링)로 합성한 ['모델링']이 아니라 그 값 그대로 저장돼야 한다.
    jest
      .spyOn(global, 'fetch')
      .mockImplementation((_url, init) =>
        Promise.resolve(respondByRequestedDuty(init)),
      );

    const result = await service.fetchJobList(1);

    const ids = result.jobs.map((job) => job.sourceId).sort();
    expect(ids).toEqual(['90001', '90002', '90003', '90004']);

    const fromDutySix = result.jobs.find((job) => job.sourceId === '90002');
    expect(fromDutySix?.jobFamilies).toEqual(['원화', '모델링']);
  });
});
