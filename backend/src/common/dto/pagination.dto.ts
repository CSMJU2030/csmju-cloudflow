import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { Paginated } from '../envelope.interceptor';

/** ?page=&limit= — ค่าเริ่มต้น 1/20 · limit สูงสุด 100 · ไม่ใช่ตัวเลข = 400 VALIDATION_ERROR */
export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page ต้องเป็นจำนวนเต็ม' })
  @Min(1, { message: 'page ต้องเริ่มจาก 1' })
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit ต้องเป็นจำนวนเต็ม' })
  @Min(1, { message: 'limit ต้องอย่างน้อย 1' })
  @Max(100, { message: 'limit สูงสุด 100 ต่อหน้า' })
  limit?: number = 20;
}

export function pageArgs(dto: PaginationDto) {
  const page = dto.page ?? 1;
  const limit = dto.limit ?? 20;
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

export function paginated<T>(rows: T[], total: number, dto: PaginationDto): Paginated<T> {
  const { page, limit } = pageArgs(dto);
  return new Paginated(rows, { total, page, limit, totalPages: Math.ceil(total / limit) });
}
