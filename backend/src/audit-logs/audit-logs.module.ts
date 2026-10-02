import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Prisma, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';

class ListAuditLogsDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'REQUEST_APPROVE' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;
}

@Injectable()
class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dto: ListAuditLogsDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(dto.action ? { action: dto.action } : {}),
      ...(dto.userId ? { userId: dto.userId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
        orderBy: { id: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(rows, total, dto);
  }
}

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'ประวัติการใช้งานระบบ (ADMIN) — ตารางนี้เขียนได้อย่างเดียว แก้ย้อนหลังไม่ได้' })
  list(@Query() dto: ListAuditLogsDto) {
    return this.service.list(dto);
  }
}

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
})
export class AuditLogsModule {}
