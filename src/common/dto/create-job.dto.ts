import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsObject } from 'class-validator';

export enum JobType {
  PAGE_VISIT = 'PAGE_VISIT',
  PAGE_CLICK = 'PAGE_CLICK',
  SIGNUP = 'SIGNUP',
  SALE = 'SALE',
  UPSELL_SALE = 'UPSELL_SALE',
  FAILED_SALE = 'FAILED_SALE',
  FAILED_SIGNUP = 'FAILED_SIGNUP',
  FAILED_UPSELL_SALE = 'FAILED_UPSELL_SALE',
  ERROR = 'ERROR',
  SCORE = 'SCORE',
}

export const JobStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  DUPLICATE: "DUPLICATE"
}

export class CreateJobDto {
  @ApiProperty({
    description: 'Type of job to process',
    enum: JobType,
    example: JobType.PAGE_VISIT,
  })
  @IsEnum(JobType)
  @IsNotEmpty()
  type: JobType;

  @ApiProperty({
    description: 'Job data payload (must include accountId)',
    example: { accountId: 'account123', url: 'https://example.com', visitorId: 'visitor123' },
  })
  @IsObject()
  @IsNotEmpty()
  body: any;

  @ApiProperty({
    description: 'Visitor ID for tracking',
    example: 'visitor123',
    required: false,
  })
  @IsString()
  @IsOptional()
  visitorId?: string;
} 