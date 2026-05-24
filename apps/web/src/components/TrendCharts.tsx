import type {
  CompanyCount,
  JobSource,
  WeeklyTrendPoint,
} from '@bini/types';

const SOURCE_LABEL: Record<JobSource, string> = {
  gamejob: '게임잡',
  wanted: '원티드',
  jobkorea: '잡코리아',
  saramin: '사람인',
  incruit: '인크루트',
};

const SOURCE_COLOR: Record<JobSource, string> = {
  gamejob: 'bg-blue-500',
  wanted: 'bg-purple-500',
  jobkorea: 'bg-green-500',
  saramin: 'bg-amber-500',
  incruit: 'bg-pink-500',
};

/**
 * 12주 신규 공고 추세 — 단순 SVG line+area. 패키지 추가 없이 그린다.
 * 데이터 0/1점일 때 일찍 fallback.
 */
export function WeeklyTrendChart({ data }: { data: WeeklyTrendPoint[] }) {
  if (!data || data.length === 0) {
    return <EmptyChart label="신규 공고 추세 데이터가 없습니다." />;
  }
  const W = 720;
  const H = 200;
  const PAD = { top: 16, right: 16, bottom: 28, left: 32 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW / 2;

  const points = data.map((d, i) => {
    const x = PAD.left + i * stepX;
    const y = PAD.top + innerH - (d.count / maxCount) * innerH;
    return { x, y, ...d };
  });
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath =
    points.length > 0
      ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${points[0].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`
      : '';

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="주별 신규 공고 추세"
        className="w-full"
      >
        {/* Y axis grid + labels (0, max/2, max) */}
        {[0, 0.5, 1].map((t) => {
          const y = PAD.top + innerH - t * innerH;
          const value = Math.round(maxCount * t);
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={PAD.left + innerW}
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray={t === 0 ? '0' : '2 3'}
              />
              <text
                x={PAD.left - 6}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="#9ca3af"
              >
                {value}
              </text>
            </g>
          );
        })}

        {/* Area + line */}
        {areaPath && <path d={areaPath} fill="#3b82f622" />}
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2" />

        {/* Points */}
        {points.map((p) => (
          <g key={p.weekStart}>
            <circle cx={p.x} cy={p.y} r="3" fill="#3b82f6" />
            <title>{`${p.weekStart} · ${p.count}건`}</title>
          </g>
        ))}

        {/* X labels (첫/중간/마지막) */}
        {points.length > 0 &&
          [0, Math.floor(points.length / 2), points.length - 1]
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .map((i) => (
              <text
                key={i}
                x={points[i].x}
                y={PAD.top + innerH + 16}
                textAnchor="middle"
                fontSize="10"
                fill="#6b7280"
              >
                {points[i].weekStart.slice(5)}
              </text>
            ))}
      </svg>
      <figcaption className="mt-1 text-xs text-gray-400">
        firstSeenAt 기준 · 최근 {data.length}주
      </figcaption>
    </figure>
  );
}

/** 회사별 누적 공고 top — 가로 막대. */
export function TopCompaniesChart({ data }: { data: CompanyCount[] }) {
  if (!data || data.length === 0) {
    return <EmptyChart label="회사별 누적 공고 데이터가 없습니다." />;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <ul className="space-y-1.5" aria-label="회사별 누적 공고 top">
      {data.map(({ company, count }) => {
        const width = (count / max) * 100;
        return (
          <li key={company} className="flex items-center gap-3 text-sm">
            <span className="w-32 truncate text-gray-700" title={company}>
              {company}
            </span>
            <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-4 rounded-full bg-indigo-500"
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="w-12 text-right tabular-nums text-gray-600">
              {count.toLocaleString()}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 활성 dedup 점유율 (primary 잡만, 비만료) — 기존 SourceBars 패턴 재사용. */
export function ActiveBySourceBars({
  bySource,
}: {
  bySource: Record<JobSource, number>;
}) {
  const entries = (Object.keys(bySource) as JobSource[])
    .map((s) => ({ source: s, count: bySource[s] }))
    .sort((a, b) => b.count - a.count);
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  const max = Math.max(...entries.map((e) => e.count), 1);

  if (total === 0) {
    return <EmptyChart label="활성 공고가 없습니다." />;
  }

  return (
    <ul className="space-y-2">
      {entries.map(({ source, count }) => {
        const pct = (count / total) * 100;
        const width = (count / max) * 100;
        return (
          <li key={source} className="flex items-center gap-3 text-sm">
            <span className="w-16 text-gray-700">{SOURCE_LABEL[source]}</span>
            <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-5 rounded-full ${SOURCE_COLOR[source]}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="w-24 text-right tabular-nums text-gray-600">
              {count.toLocaleString()}{' '}
              <span className="text-xs text-gray-400">({pct.toFixed(0)}%)</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-md bg-gray-50 text-sm text-gray-400">
      {label}
    </div>
  );
}
