import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIP, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

import { PaginationDto } from '../../common/dto/pagination.dto';
import { QueryBoolean } from '../../common/dto/query-boolean';

export class CreateAllocationDto {
  @ApiProperty({ format: 'uuid', description: 'คำขอต้องอยู่ในสถานะ APPROVED' })
  @IsUUID('4', { message: 'requestId ต้องเป็น UUID v4' })
  requestId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'resourceId ต้องเป็น UUID v4' })
  resourceId!: string;

  @ApiProperty({ example: '10.10.20.31' })
  @IsIP(undefined, { message: 'ipAddress ต้องเป็น IP ที่ถูกต้อง (IPv4 หรือ IPv6)' })
  ipAddress!: string;

  @ApiProperty({ example: 22001, minimum: 1, maximum: 65535 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'port ต้องอยู่ระหว่าง 1–65535' })
  @Max(65535, { message: 'port ต้องอยู่ระหว่าง 1–65535' })
  port!: number;

  @ApiPropertyOptional({ example: 'ssh cs401@10.10.20.31 -p 22001' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  accessNote?: string;
}

export class ReleaseAllocationDto {
  @ApiPropertyOptional({ description: 'บันทึกเพิ่มตอนคืนเครื่อง' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ListAllocationsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'true = เฉพาะที่ยังใช้อยู่ · false = เฉพาะที่คืนแล้ว' })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean({ message: 'active ต้องเป็น true หรือ false' })
  active?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'resourceId ต้องเป็น UUID v4' })
  resourceId?: string;
}
