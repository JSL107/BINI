import type { Metadata } from 'next';
import Link from 'next/link';
import { PortfolioChecklist } from '../../components/PortfolioChecklist';

export const metadata: Metadata = {
  title: '포트폴리오 카테고리 · BINI',
  description:
    '내 포트폴리오가 커버하는 카테고리를 체크해 두면 공고 카드에 매칭률과 부족한 영역을 표시한다.',
};

export default function PortfolioPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-4 text-sm">
        <Link href="/" className="text-gray-600 hover:text-gray-900 hover:underline">
          공고 목록
        </Link>
        <Link
          href="/companies"
          className="text-gray-600 hover:text-gray-900 hover:underline"
        >
          회사 채용 페이지
        </Link>
        <Link href="/stats" className="text-gray-600 hover:text-gray-900 hover:underline">
          통계
        </Link>
        <span className="font-semibold text-gray-900">포트폴리오</span>
        <Link href="/calendar" className="text-gray-600 hover:text-gray-900 hover:underline">
          캘린더
        </Link>
        <Link href="/saved" className="text-gray-600 hover:text-gray-900 hover:underline">
          스크랩
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">내 포트폴리오 카테고리</h1>
        <p className="mt-2 text-sm text-gray-600">
          현재 보유하고 있는 카테고리를 체크해 두면 공고 목록에서 카드마다 매칭률과
          부족한 카테고리가 표시된다. 데이터는 이 브라우저에만 저장되며 서버에는 보내지 않는다.
        </p>
      </header>

      <PortfolioChecklist />
    </main>
  );
}
