import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

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
  @Min(1)
  @Max(100, { message: 'limit สูงสุด 100 ต่อหน้า' })
  limit?: number = 20;

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 20);
  }
}

export function paginated<T>(rows: T[], total: number, dto: PaginationDto) {
  const limit = dto.limit ?? 20;
  const page = dto.page ?? 1;
  return {
    data: rows,
    meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 0 },
  };
}
