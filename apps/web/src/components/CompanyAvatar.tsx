'use client';

import { useState } from 'react';
import Image from 'next/image';

export interface CompanyAvatarProps {
  logoUrl: string | null;
  name: string;
}

function initialFor(name: string): string {
  // 첫 비-공백 문자. "㈜원더소프트" → "㈜", "ARTTREE" → "A".
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : '?';
}

/**
 * 카드 헤더의 회사 로고 동그라미. 로고 URL이 있으면 이미지, 없거나 로드 실패면 첫 글자 폴백.
 *
 * next/image로 외부 호스트(인크루트·게임잡 등) 로고를 Vercel image optimization
 * 통과시킨다. 36px 고정 크기라 width/height 명시 — CLS=0 + Vercel이 사이즈에
 * 맞춰 WebP/AVIF로 변환·캐시. 카드 다수에 등장하는 자산이라 cache hit률 매우 높음.
 */
export function CompanyAvatar({ logoUrl, name }: CompanyAvatarProps) {
  const [failed, setFailed] = useState(false);

  if (logoUrl && !failed) {
    return (
      <Image
        data-testid="company-logo"
        src={logoUrl}
        alt={`${name} 로고`}
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      data-testid="company-initial"
      aria-label={`${name} 로고 (기본)`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600 ring-1 ring-gray-200"
    >
      {initialFor(name)}
    </div>
  );
}
