'use client';

import { useEffect, useState } from 'react';
import {
  PORTFOLIO_CATEGORIES,
  CATEGORY_LABEL,
  loadOwnedCategories,
  saveOwnedCategories,
  type PortfolioCategory,
} from '../lib/portfolio';

/**
 * 8개 카테고리 토글 체크리스트. localStorage(`bini:portfolio:owned-v1`)에 영속.
 *
 * 초기 마운트 시 SSR/CSR 미스매치를 피하기 위해 `ready` 플래그 전까지 비어 있는
 * 상태로 렌더한다 (서버 렌더는 항상 빈 Set이므로 클라이언트의 첫 paint도 동일).
 * 마운트 후 useEffect에서 한 번 로드하면 그 다음부터는 일반 상태로 동작.
 */
export function PortfolioChecklist() {
  const [owned, setOwned] = useState<Set<PortfolioCategory>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOwned(loadOwnedCategories());
    setReady(true);
  }, []);

  function toggle(cat: PortfolioCategory) {
    setOwned((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      saveOwnedCategories(next);
      return next;
    });
  }

  function selectAll() {
    const all = new Set<PortfolioCategory>(PORTFOLIO_CATEGORIES);
    saveOwnedCategories(all);
    setOwned(all);
  }

  function clearAll() {
    saveOwnedCategories(new Set());
    setOwned(new Set());
  }

  return (
    <section
      aria-label="포트폴리오 카테고리 체크리스트"
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          보유 카테고리 <span className="text-gray-400">({owned.size}/{PORTFOLIO_CATEGORIES.length})</span>
        </p>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={selectAll}
            disabled={!ready}
            className="rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            전체 선택
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={!ready || owned.size === 0}
            className="rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            전체 해제
          </button>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {PORTFOLIO_CATEGORIES.map((cat) => {
          const checked = owned.has(cat);
          return (
            <li key={cat}>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition focus-within:ring-2 focus-within:ring-blue-400 ${
                  checked
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(cat)}
                  disabled={!ready}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                />
                <span>{CATEGORY_LABEL[cat]}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-gray-500">
        체크 즉시 저장 — 이 브라우저의 localStorage에 보관된다. 다른 기기에서는 보이지 않음.
      </p>
    </section>
  );
}
