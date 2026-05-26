import type {
  CronRunStatus,
  CronRunSummary,
  JobSource,
  StatsResponse,
} from '@bini/types';
import {
  ActiveBySourceBars,
  TopCompaniesChart,
  WeeklyTrendChart,
} from '../../components/TrendCharts';

export const revalidate = 60; // 1분마다 ISR

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

async function fetchStats(): Promise<StatsResponse | null> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';
  try {
    const res = await fetch(`${base}/stats`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function StatsPage() {
  const stats = await fetchStats();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-6 flex items-center gap-4 text-sm">
        <a href="/" className="text-gray-600 hover:text-gray-900 hover:underline">
          공고 목록
        </a>
        <a href="/companies" className="text-gray-600 hover:text-gray-900 hover:underline">
          회사 채용 페이지
        </a>
        <a href="/stats" className="font-semibold text-gray-900">
          통계
        </a>
        <a href="/portfolio" className="text-gray-600 hover:text-gray-900 hover:underline">
          포트폴리오
        </a>
      </nav>

      <h1 className="mb-6 text-2xl font-bold">멀티소스 적재 현황</h1>

      {!stats ? (
        <p className="text-gray-500">통계를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.</p>
      ) : (
        <>
          <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryCard label="전체 공고" value={stats.total.toLocaleString()} />
            <SummaryCard label="활성" value={stats.active.toLocaleString()} tone="active" />
            <SummaryCard label="만료" value={stats.expired.toLocaleString()} tone="dim" />
            <SummaryCard label="최근 24h 신규" value={stats.newLast24h.toLocaleString()} tone="accent" />
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-gray-800">소스별 분포 (전체)</h2>
            <SourceBars bySource={stats.bySource} total={stats.total} />
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-gray-800">
              주별 신규 공고 추세
            </h2>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <WeeklyTrendChart data={stats.weeklyTrend ?? []} />
            </div>
          </section>

          <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <h2 className="mb-3 text-lg font-semibold text-gray-800">
                회사별 누적 공고 Top 20
              </h2>
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <TopCompaniesChart data={stats.topCompanies ?? []} />
              </div>
            </div>
            <div>
              <h2 className="mb-3 text-lg font-semibold text-gray-800">
                활성 공고 소스 점유율 (dedup 후)
              </h2>
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <ActiveBySourceBars
                  bySource={
                    stats.activeBySource ?? {
                      gamejob: 0,
                      wanted: 0,
                      jobkorea: 0,
                      saramin: 0,
                      incruit: 0,
                    }
                  }
                />
              </div>
            </div>
          </section>

          <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SummaryCard
              label="상세 enrichment 완료"
              value={`${stats.enrichedCount.toLocaleString()} / ${stats.total.toLocaleString()}`}
              sub={`${(stats.enrichedRatio * 100).toFixed(1)}%`}
            />
            <SummaryCard
              label="마지막 cron 적재"
              value={stats.lastCronRunAt ? new Date(stats.lastCronRunAt).toLocaleString('ko-KR') : '—'}
              sub={stats.lastCronRunAt ? relativeMinutes(stats.lastCronRunAt) : undefined}
            />
          </section>

          {stats.recentCronRuns && stats.recentCronRuns.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-semibold text-gray-800">
                최근 cron 실행 이력
              </h2>
              <RecentCronRunsTable runs={stats.recentCronRuns} />
            </section>
          )}

          <p className="text-xs text-gray-400">
            마지막 갱신 {new Date(stats.generatedAt).toLocaleTimeString('ko-KR')} · 1분 캐시
          </p>
        </>
      )}
    </main>
  );
}

const CRON_STATUS_STYLE: Record<CronRunStatus, { label: string; cls: string }> = {
  success: { label: '성공', cls: 'bg-green-100 text-green-700' },
  partial_failure: { label: '부분실패', cls: 'bg-amber-100 text-amber-700' },
  total_failure: { label: '전체실패', cls: 'bg-red-100 text-red-700' },
  crashed: { label: '크래시', cls: 'bg-red-200 text-red-800' },
};

function RecentCronRunsTable({ runs }: { runs: CronRunSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">시작</th>
            <th className="px-3 py-2">상태</th>
            <th className="px-3 py-2 text-right">소요</th>
            <th className="px-3 py-2 text-right">페이지</th>
            <th className="px-3 py-2 text-right">신규</th>
            <th className="px-3 py-2 text-right">dedup</th>
            <th className="px-3 py-2 text-right">만료</th>
            <th className="px-3 py-2 text-right">상세 갱신</th>
            <th className="px-3 py-2">실패 소스</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const s = CRON_STATUS_STYLE[r.status];
            return (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                  {new Date(r.startedAt).toLocaleString('ko-KR', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${s.cls}`}
                    title={r.errorMessage ?? undefined}
                  >
                    {s.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-600">
                  {r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                  {r.pagesProcessed}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-blue-700">
                  {r.newTotal}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {r.dedupedTotal}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                  {r.expiredSwept}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                  {r.detailRescrapeUpdated}/{r.detailRescrapeAttempted}
                  {r.detailRescrapeFailed > 0 && (
                    <span className="ml-1 text-red-600">!{r.detailRescrapeFailed}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {r.failedSources.length > 0 ? r.failedSources.join(', ') : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'active' | 'dim' | 'accent';
}) {
  const valueColor =
    tone === 'active'
      ? 'text-green-700'
      : tone === 'dim'
      ? 'text-gray-400'
      : tone === 'accent'
      ? 'text-blue-700'
      : 'text-gray-900';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function SourceBars({
  bySource,
  total,
}: {
  bySource: Record<JobSource, number>;
  total: number;
}) {
  const entries = (Object.keys(bySource) as JobSource[])
    .map((s) => ({ source: s, count: bySource[s] }))
    .sort((a, b) => b.count - a.count);
  const max = Math.max(...entries.map((e) => e.count), 1);
  return (
    <ul className="space-y-2">
      {entries.map(({ source, count }) => {
        const pct = total > 0 ? (count / total) * 100 : 0;
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
              {count.toLocaleString()} <span className="text-xs text-gray-400">({pct.toFixed(0)}%)</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function relativeMinutes(isoTime: string): string {
  const diffMs = Date.now() - new Date(isoTime).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
