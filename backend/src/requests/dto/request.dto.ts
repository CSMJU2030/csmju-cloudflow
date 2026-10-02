import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { RequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateRequestDto {
  @ApiProperty({ example: 2, description: 'id ของอาจารย์ผู้รับรอง (ดูจาก GET /users/teachers)' })
  @Type(() => Number)
  @IsInt({ message: 'teacherId ต้องเป็นตัวเลข' })
  @Min(1)
  teacherId: number;

  @ApiProperty({ example: 'CS401' })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  subjectCode: string;

  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'reqCpu ต้องมากกว่า 0' })
  @Max(256)
  reqCpu: number;

  @ApiProperty({ example: 16 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'reqRamGb ต้องมากกว่า 0' })
  @Max(2048)
  reqRamGb: number;

  @ApiProperty({ example: 200 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'reqStorageGb ต้องมากกว่า 0' })
  @Max(100000)
  reqStorageGb: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  reqGpu?: boolean;

  @ApiProperty({ example: 'ฝึกโมเดล object detection สำหรับโปรเจกต์จบ' })
  @IsString()
  @MinLength(10, { message: 'reason ต้องอธิบายอย่างน้อย 10 ตัวอักษร' })
  @MaxLength(2000)
  reason: string;

  @ApiProperty({ example: '2026-10-01', format: 'date' })
  @IsDateString({}, { message: 'startDate ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  startDate: string;

  @ApiProperty({ example: '2026-12-31', format: 'date' })
  @IsDateString({}, { message: 'endDate ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  endDate: string;
}

/** แก้ได้เฉพาะตอนยังเป็น PENDING และเฉพาะเจ้าของคำขอ */
export class UpdateRequestDto extends PartialType(CreateRequestDto) {}

export class RejectRequestDto {
  @ApiProperty({ example: 'ทรัพยากรที่ขอสูงเกินความจำเป็นของรายวิชา' })
  @IsString()
  @IsNotEmpty({ message: 'ปฏิเสธคำขอต้องระบุเหตุผล' })
  @MinLength(5, { message: 'rejectReason ต้องยาวอย่างน้อย 5 ตัวอักษร' })
  @MaxLength(2000)
  rejectReason: string;
}

export class ListRequestsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: RequestStatus })
  @IsOptional()
  @IsEnum(RequestStatus, {
    message: 'status ต้องเป็น PENDING, APPROVED, REJECTED, ALLOCATED, CANCELLED หรือ EXPIRED',
  })
  status?: RequestStatus;

  @ApiPropertyOptional({ description: 'กรองตามรหัสวิชา' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  subjectCode?: string;

  @ApiPropertyOptional({ description: 'ADMIN เท่านั้น — ดูคำขอของนักศึกษาคนใดคนหนึ่ง' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  studentId?: number;
}
