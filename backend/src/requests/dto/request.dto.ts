import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { RequestStatus } from '../../generated/prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** code ของ Core Hub: ตัวพิมพ์ใหญ่ ตัวเลข และ - ยาวไม่เกิน 50 (reference-data.md ข้อ 4) */
export const CORE_HUB_CODE = /^[A-Z0-9-]{1,50}$/;
/** personCode ของบุคลากร = ส่วนหน้าอีเมลมหาวิทยาลัย จึงมีตัวพิมพ์เล็ก . _ - ได้ */
export const PERSON_CODE = /^[A-Za-z0-9._-]{1,64}$/;

export class CreateRequestDto {
  @ApiProperty({ example: '10301111-1', description: 'รหัสรายวิชาเต็มรวมรุ่นของ Core Hub (GET /api/v1/courses)' })
  @IsString()
  @Matches(CORE_HUB_CODE, { message: 'courseCode ต้องเป็นรหัสรายวิชาของ Core Hub (A-Z 0-9 -)' })
  courseCode!: string;

  @ApiPropertyOptional({
    example: 'somchai.t',
    description: 'personCode ของอาจารย์ผู้รับรอง (GET /api/v1/advisors) · ไม่ระบุ = อาจารย์คนใดก็พิจารณาได้',
  })
  @IsOptional()
  @IsString()
  @Matches(PERSON_CODE, { message: 'teacherPersonCode ต้องเป็นรหัสบุคลากรของ Core Hub' })
  teacherPersonCode?: string;

  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'reqCpu ต้องมากกว่า 0' })
  @Max(256)
  reqCpu!: number;

  @ApiProperty({ example: 16 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'reqRamGb ต้องมากกว่า 0' })
  @Max(2048)
  reqRamGb!: number;

  @ApiProperty({ example: 200 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'reqStorageGb ต้องมากกว่า 0' })
  @Max(100000)
  reqStorageGb!: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isGpuRequired?: boolean;

  @ApiProperty({ example: 'ฝึกโมเดล object detection สำหรับโปรเจกต์จบ' })
  @IsString()
  @MinLength(10, { message: 'reason ต้องอธิบายอย่างน้อย 10 ตัวอักษร' })
  @MaxLength(2000)
  reason!: string;

  @ApiProperty({ example: '2026-10-01', format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'startDate ต้องเป็นวันที่ที่มีจริง' })
  startDate!: string;

  @ApiProperty({ example: '2026-12-31', format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'endDate ต้องเป็นวันที่ที่มีจริง' })
  endDate!: string;
}

/** แก้ได้เฉพาะตอนยังเป็น PENDING และเฉพาะเจ้าของคำขอ */
export class UpdateRequestDto extends PartialType(CreateRequestDto) {}

export class RejectRequestDto {
  @ApiProperty({ example: 'ทรัพยากรที่ขอสูงเกินความจำเป็นของรายวิชา' })
  @IsString()
  @IsNotEmpty({ message: 'ปฏิเสธคำขอต้องระบุเหตุผล' })
  @MinLength(5, { message: 'rejectReason ต้องยาวอย่างน้อย 5 ตัวอักษร' })
  @MaxLength(2000)
  rejectReason!: string;
}

export class ListRequestsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: RequestStatus })
  @IsOptional()
  @IsEnum(RequestStatus, {
    message: 'status ต้องเป็น PENDING, APPROVED, REJECTED, ALLOCATED, CANCELLED หรือ EXPIRED',
  })
  status?: RequestStatus;

  @ApiPropertyOptional({ description: 'กรองตามรหัสรายวิชา' })
  @IsOptional()
  @Matches(CORE_HUB_CODE, { message: 'courseCode ต้องเป็นรหัสรายวิชาของ Core Hub' })
  courseCode?: string;

  @ApiPropertyOptional({ description: 'ผู้ที่มี request:read:any เท่านั้น — ดูคำขอของผู้ใช้คนหนึ่ง (core_user_id)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  coreUserId?: string;
}
