import { Injectable, Logger } from '@nestjs/common';
import type { CareerSiteLink, CareerSitesResponse } from '@bini/types';
import { parseCareerSitesMarkdown } from './companies-parser';

const README_URL =
  'https://raw.githubusercontent.com/GameForPeople/korea-game-career-site/master/README.md';
const SOURCE_ID = 'github:GameForPeople/korea-game-career-site';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);
  private cached: { response: CareerSitesResponse; expiresAt: number } | null = null;

  async getCareerSites(): Promise<CareerSitesResponse> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.response;
    }
    const sites = await this.fetchAndParse();
    const response: CareerSitesResponse = {
      sites,
      source: SOURCE_ID,
      fetchedAt: new Date(now).toISOString(),
    };
    this.cached = { response, expiresAt: now + CACHE_TTL_MS };
    return response;
  }

  private async fetchAndParse(): Promise<CareerSiteLink[]> {
    try {
      const res = await fetch(README_URL, {
        headers: { 'User-Agent': 'bini-companies/1.0' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`GitHub README fetch 실패: HTTP ${res.status}`);
        return [];
      }
      const md = await res.text();
      const sites = parseCareerSitesMarkdown(md);
      this.logger.log(`Career sites parsed: ${sites.length}건`);
      return sites;
    } catch (err) {
      this.logger.warn(`GitHub README fetch 예외: ${String(err)}`);
      return [];
    }
  }
}
