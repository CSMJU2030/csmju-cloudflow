import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

import { StorageRequestStatus } from '../../generated/prisma/enums';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CORE_HUB_CODE, PERSON_CODE } from '../../requests/dto/request.dto';

export class CreateStorageRequestDto {
  @ApiProperty({ example: '10301111-1', description: 'รหัสรายวิชาเต็มรวมรุ่นของ Core Hub' })
  @IsString()
  @Matches(CORE_HUB_CODE, { message: 'courseCode ต้องเป็นรหัสรายวิชาของ Core Hub (A-Z 0-9 -)' })
  courseCode!: string;

  @ApiPropertyOptional({ example: 'somchai.t', description: 'personCode ของอาจารย์ผู้อนุมัติ · ไม่ระบุ = อาจารย์คนใดก็ได้' })
  @IsOptional()
  @IsString()
  @Matches(PERSON_CODE, { message: 'teacherPersonCode ต้องเป็นรหัสบุคลากรของ Core Hub' })
  teacherPersonCode?: string;

  @ApiProperty({ example: 15, description: 'ขนาดที่ขอ (GB) — เพดานต่อคนตรวจกับ pool อีกชั้น' })
  @Type(() => Number)
  @IsInt({ message: 'quotaGb ต้องเป็นจำนวนเต็ม' })
  @Min(1, { message: 'quotaGb ต้องอย่างน้อย 1' })
  @Max(1024)
  quotaGb!: number;

  @ApiProperty({ example: 'เก็บ dataset สำหรับโปรเจกต์จบ' })
  @IsString()
  @MinLength(10, { message: 'reason ต้องอธิบายอย่างน้อย 10 ตัวอักษร' })
  @MaxLength(2000)
  reason!: string;

  @ApiProperty({ example: '2026-10-15', format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'startDate ต้องเป็นวันที่ที่มีจริง' })
  startDate!: string;

  @ApiProperty({ example: '2027-02-28', format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'endDate ต้องเป็นวันที่ที่มีจริง' })
  endDate!: string;
}

export class RejectStorageRequestDto {
  @ApiProperty({ example: 'ขนาดที่ขอเกินความจำเป็นของรายวิชา' })
  @IsString()
  @IsNotEmpty({ message: 'ปฏิเสธคำขอต้องระบุเหตุผล' })
  @MinLength(5, { message: 'rejectReason ต้องยาวอย่างน้อย 5 ตัวอักษร' })
  @MaxLength(2000)
  rejectReason!: string;
}

export class ListStorageRequestsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: StorageRequestStatus })
  @IsOptional()
  @IsEnum(StorageRequestStatus, { message: 'status ไม่ถูกต้อง' })
  status?: StorageRequestStatus;
}
