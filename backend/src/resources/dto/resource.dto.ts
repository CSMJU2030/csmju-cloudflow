import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ResourceStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateResourceDto {
  @ApiProperty({ example: 'cs-node-05' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  serverName: string;

  @ApiProperty({ example: 32, description: 'ความจุรวมของเครื่อง ไม่ใช่ที่เหลือ' })
  @IsInt()
  @Min(1, { message: 'totalCpu ต้องมากกว่า 0' })
  totalCpu: number;

  @ApiProperty({ example: 128 })
  @IsInt()
  @Min(1, { message: 'totalRamGb ต้องมากกว่า 0' })
  totalRamGb: number;

  @ApiProperty({ example: 2000 })
  @IsInt()
  @Min(1, { message: 'totalStorageGb ต้องมากกว่า 0' })
  totalStorageGb: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasGpu?: boolean;

  @ApiPropertyOptional({ enum: ResourceStatus, default: 'AVAILABLE' })
  @IsOptional()
  @IsEnum(ResourceStatus, { message: 'status ต้องเป็น AVAILABLE, FULL, MAINTENANCE หรือ OFFLINE' })
  status?: ResourceStatus;
}

export class UpdateResourceDto extends PartialType(CreateResourceDto) {}

export class ListResourcesDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ResourceStatus })
  @IsOptional()
  @IsEnum(ResourceStatus)
  status?: ResourceStatus;

  @ApiPropertyOptional({ description: 'true = เฉพาะเครื่องที่มี GPU' })
  @IsOptional()
  @IsBoolean()
  hasGpu?: boolean;
}
