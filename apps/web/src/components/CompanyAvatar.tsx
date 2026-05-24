'use client';

import { useState } from 'react';

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
 */
export function CompanyAvatar({ logoUrl, name }: CompanyAvatarProps) {
  const [failed, setFailed] = useState(false);

  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        data-testid="company-logo"
        src={logoUrl}
        alt={`${name} 로고`}
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
