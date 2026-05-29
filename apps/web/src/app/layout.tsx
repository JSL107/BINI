import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Next.js 16: viewport는 별도 export. 미설정 시 일부 브라우저에서 모바일 뷰포트가
// 데스크탑(980px)으로 잡혀 글자 크기·터치 영역이 어긋난다.
// initialScale=1 + width=device-width로 정상 모바일 렌더 보장.
// maximumScale은 의도적으로 미설정 — 사용자 접근성 차원에서 줌 제한 안 함.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BINI · 게임 원화 채용공고",
  description:
    "한국 게임 회사의 원화·컨셉아트 채용 공고를 한 곳에서. 게임잡·원티드·잡코리아·사람인·인크루트 통합 — 등록일순 정렬, 회사·게임 이미지 함께.",
  applicationName: "BINI",
  keywords: ["게임", "원화", "컨셉아트", "채용", "게임잡", "원티드", "잡코리아", "사람인", "인크루트"],
  openGraph: {
    title: "BINI · 게임 원화 채용공고",
    description: "한국 게임 회사 원화·컨셉아트 채용 공고 통합",
    type: "website",
    locale: "ko_KR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
