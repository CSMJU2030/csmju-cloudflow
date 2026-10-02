import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIP,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateAllocationDto {
  @ApiProperty({ example: 1, description: 'คำขอต้องอยู่ในสถานะ APPROVED' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requestId: number;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  resourceId: number;

  @ApiProperty({ example: '10.10.20.31' })
  @IsIP(undefined, { message: 'ipAddress ต้องเป็น IP ที่ถูกต้อง (IPv4 หรือ IPv6)' })
  ipAddress: string;

  @ApiProperty({ example: 22001, minimum: 1, maximum: 65535 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'port ต้องอยู่ระหว่าง 1–65535' })
  @Max(65535, { message: 'port ต้องอยู่ระหว่าง 1–65535' })
  port: number;

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
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resourceId?: number;
}
