import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import { BadImageService } from './bad-image.service';

interface ReportBadImageDto {
  imageUrl?: string;
  jobId?: string;
  reason?: string;
}

@Controller('job-images')
export class BadImageController {
  constructor(private readonly badImage: BadImageService) {}

  /**
   * 사용자가 "이 이미지 잘못됐어요" 버튼을 눌렀을 때 호출.
   * imageUrl만 필수. jobId/reason은 분석용 메타데이터.
   */
  @Post('report-bad')
  @HttpCode(204)
  async report(@Body() body: ReportBadImageDto): Promise<void> {
    const imageUrl = (body.imageUrl ?? '').trim();
    if (!imageUrl) {
      throw new BadRequestException('imageUrl is required');
    }
    if (imageUrl.length > 2048) {
      throw new BadRequestException('imageUrl too long');
    }
    if (!/^https?:\/\//i.test(imageUrl)) {
      throw new BadRequestException('imageUrl must be http(s)');
    }
    const jobId = (body.jobId ?? '').trim() || null;
    const reason = ((body.reason ?? '').trim() || null)?.slice(0, 500) ?? null;
    await this.badImage.report(imageUrl, jobId, reason);
  }
}
