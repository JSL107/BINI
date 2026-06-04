import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Vercel image optimization 함수가 carousel/avatar/photos의 외부 호스트
     * 이미지를 fetch + WebP/AVIF 변환 + 캐시한 뒤 동일 origin에서 serve.
     * 핫링크 raw 다운로드 대비 (1) connection pool 분산 해소, (2) 30-70%
     * 크기 감소, (3) 카드 폭에 맞춘 width 변환의 3중 이득.
     *
     * SSRF/abuse 표면 축소를 위해 wildcard는 single-level (`*.host`)만 사용 —
     * `**.naver.com` 같은 cross-level wildcard는 `blog.naver.com`/`cafe.naver.com`
     * 같은 user-generated sub-domain까지 trust해 Vercel image optimizer를
     * fetching proxy로 악용당할 위험. naver는 CDN host(`*.pstatic.net`)로 한정,
     * `naver.com`/`naver.net`은 등록 안 함.
     *
     * 알려진 정확한 host는 exact match로 두고, sub-domain 변동이 흔한 잡사이트
     * 류는 single-level wildcard로 흡수.
     *
     * 캐시 TTL을 30일로 둬서 외부 호스트로의 cache miss 핫링크 트래픽 최소화 —
     * 회사 로고/대표 게임 이미지는 사실상 정적 자원이라 안전.
     */
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      { protocol: 'https', hostname: 'file.gamejob.co.kr' },
      { protocol: 'https', hostname: 'img.gamejob.co.kr' },
      { protocol: 'https', hostname: 'l.incru.it' },
      { protocol: 'https', hostname: '*.wanted.co.kr' },
      { protocol: 'https', hostname: '*.wantedinc.com' },
      { protocol: 'https', hostname: '*.saramin.co.kr' },
      { protocol: 'https', hostname: '*.jobkorea.co.kr' },
      { protocol: 'https', hostname: '*.jobplanet.co.kr' },
      { protocol: 'https', hostname: '*.pstatic.net' },
    ],
  },
};

export default nextConfig;
