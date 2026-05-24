import { describe, it, expect, beforeEach } from 'vitest';
import {
  categorizeJob,
  matchJobToOwned,
  loadOwnedCategories,
  saveOwnedCategories,
  PORTFOLIO_CATEGORIES,
  PORTFOLIO_CHANGE_EVENT,
  type PortfolioCategory,
} from './portfolio';
import type { Job } from '@bini/types';

function mkJob(over: Partial<Job> & { title: string }): Pick<
  Job,
  'title' | 'tags' | 'gameTitle'
> {
  return {
    title: over.title,
    tags: over.tags ?? [],
    gameTitle: over.gameTitle ?? null,
  };
}

describe('categorizeJob', () => {
  it('한국어 캐릭터/배경/UI 키워드를 인식한다', () => {
    expect(categorizeJob(mkJob({ title: '캐릭터 원화가 모집' }))).toEqual(
      new Set<PortfolioCategory>(['character', 'concept', 'illustration']),
    );
    expect(categorizeJob(mkJob({ title: '배경 컨셉아트 디자이너' }))).toEqual(
      new Set<PortfolioCategory>(['background', 'concept']),
    );
    expect(categorizeJob(mkJob({ title: 'UI/UX 디자이너' }))).toEqual(
      new Set<PortfolioCategory>(['ui']),
    );
  });

  it('영문 키워드 + tags 합성 매칭', () => {
    expect(
      categorizeJob(
        mkJob({ title: '3D Character Modeler', tags: ['Animation', 'Rigging'] }),
      ),
    ).toEqual(new Set<PortfolioCategory>(['character', 'modeling3d', 'animation']));
  });

  it('이펙트/VFX 약자 매칭', () => {
    expect(categorizeJob(mkJob({ title: 'VFX 아티스트 (이펙트)' }))).toEqual(
      new Set<PortfolioCategory>(['effect']),
    );
    expect(categorizeJob(mkJob({ title: 'FX Artist' }))).toEqual(
      new Set<PortfolioCategory>(['effect']),
    );
  });

  it('어떤 키워드에도 매칭 안 되면 빈 Set', () => {
    expect(categorizeJob(mkJob({ title: '서버 개발자' }))).toEqual(new Set());
  });

  it('false-positive 회귀 방지 — 너무 일반어/약자 단독 매칭 금지', () => {
    // 복지 문구의 "환경"은 background로 매칭되면 안 된다
    expect(categorizeJob(mkJob({ title: '서버 개발자', tags: ['근무 환경 우수'] }))).toEqual(
      new Set(),
    );
    expect(categorizeJob(mkJob({ title: '개발 환경 지원', tags: [] }))).toEqual(new Set());
    // "등장인물"만으로는 character 매칭 안 한다 (시나리오 직군 등 충돌)
    expect(categorizeJob(mkJob({ title: '등장인물 시나리오 라이터' }))).toEqual(new Set());
    // "3D" 단독은 modeling3d 매칭 안 한다 — UI/이펙트 직군에도 흔히 등장
    expect(categorizeJob(mkJob({ title: '3D UI 디자이너' }))).toEqual(
      new Set<PortfolioCategory>(['ui']),
    );
    expect(categorizeJob(mkJob({ title: '3D 이펙트 아티스트' }))).toEqual(
      new Set<PortfolioCategory>(['effect']),
    );
    // "fx" 단독 약자는 effect 매칭 안 한다 (vfx / 이펙트만 유효)
    expect(categorizeJob(mkJob({ title: 'MaxFx 라이브러리 개발자' }))).toEqual(new Set());
  });

  it('gameTitle도 매칭 텍스트에 포함', () => {
    expect(
      categorizeJob(mkJob({ title: '디자이너', gameTitle: '캐릭터 액션 RPG' })),
    ).toEqual(new Set<PortfolioCategory>(['character']));
  });
});

describe('matchJobToOwned', () => {
  it('owned 카테고리와 required 카테고리의 교집합/차집합/점수를 계산', () => {
    const job = mkJob({
      title: '3D 캐릭터 모델러',
      tags: ['리깅', 'animation'],
    });
    const owned = new Set<PortfolioCategory>(['character', 'modeling3d']);
    const m = matchJobToOwned(job, owned);
    expect(new Set(m.required)).toEqual(
      new Set<PortfolioCategory>(['character', 'modeling3d', 'animation']),
    );
    expect(new Set(m.matched)).toEqual(
      new Set<PortfolioCategory>(['character', 'modeling3d']),
    );
    expect(m.missing).toEqual(['animation']);
    expect(m.score).toBeCloseTo(2 / 3, 3);
  });

  it('required가 비어 있으면 score=1.0 (필터 매칭 의미 없음)', () => {
    const m = matchJobToOwned(mkJob({ title: '서버 개발자' }), new Set());
    expect(m.required).toEqual([]);
    expect(m.matched).toEqual([]);
    expect(m.missing).toEqual([]);
    expect(m.score).toBe(1);
  });

  it('전부 보유하면 score=1.0', () => {
    const m = matchJobToOwned(
      mkJob({ title: '캐릭터 원화가' }),
      new Set<PortfolioCategory>(['character', 'concept', 'illustration']),
    );
    expect(m.score).toBe(1);
    expect(m.missing).toEqual([]);
  });

  it('하나도 안 보유하면 score=0', () => {
    const m = matchJobToOwned(mkJob({ title: '캐릭터 원화가' }), new Set());
    expect(m.score).toBe(0);
    expect(m.matched).toEqual([]);
  });
});

describe('localStorage 라운드트립', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('save → load 라운드트립', () => {
    const owned = new Set<PortfolioCategory>(['character', 'effect', 'ui']);
    saveOwnedCategories(owned);
    expect(loadOwnedCategories()).toEqual(owned);
  });

  it('빈 Set 저장 후에도 load는 빈 Set', () => {
    saveOwnedCategories(new Set());
    expect(loadOwnedCategories()).toEqual(new Set());
  });

  it('초기 상태: 키 없으면 빈 Set', () => {
    expect(loadOwnedCategories()).toEqual(new Set());
  });

  it('손상된 JSON은 무시하고 빈 Set 반환', () => {
    window.localStorage.setItem('bini:portfolio:owned-v1', '!!! not json');
    expect(loadOwnedCategories()).toEqual(new Set());
  });

  it('배열이 아니면 빈 Set 반환', () => {
    window.localStorage.setItem(
      'bini:portfolio:owned-v1',
      JSON.stringify({ character: true }),
    );
    expect(loadOwnedCategories()).toEqual(new Set());
  });

  it('알 수 없는 카테고리는 자동 필터링 (forward compat)', () => {
    window.localStorage.setItem(
      'bini:portfolio:owned-v1',
      JSON.stringify(['character', 'unknown_category', 'ui', 123]),
    );
    expect(loadOwnedCategories()).toEqual(
      new Set<PortfolioCategory>(['character', 'ui']),
    );
  });

  it('saveOwnedCategories는 같은 탭 동기화용 커스텀 이벤트를 발행한다', async () => {
    const { vi } = await import('vitest');
    const handler = vi.fn();
    window.addEventListener(PORTFOLIO_CHANGE_EVENT, handler);
    try {
      saveOwnedCategories(new Set<PortfolioCategory>(['character']));
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(PORTFOLIO_CHANGE_EVENT, handler);
    }
  });
});

describe('PORTFOLIO_CATEGORIES', () => {
  it('8개 카테고리 — 키 중복 없음', () => {
    expect(PORTFOLIO_CATEGORIES.length).toBe(8);
    expect(new Set(PORTFOLIO_CATEGORIES).size).toBe(PORTFOLIO_CATEGORIES.length);
  });
});
