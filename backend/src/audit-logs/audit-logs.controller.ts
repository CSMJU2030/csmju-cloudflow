import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import type { Prisma } from '../generated/prisma/client';
import { PaginationDto, pageArgs, paginated } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';

class ListAuditLogsDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'REQUEST_APPROVE' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z_]{1,100}$/, { message: 'action ต้องเป็นตัวพิมพ์ใหญ่และ _ เท่านั้น' })
  action?: string;

  @ApiPropertyOptional({ description: 'core_user_id ของผู้กระทำ' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  coreUserId?: string;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dto: ListAuditLogsDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(dto.action ? { action: dto.action } : {}),
      ...(dto.coreUserId ? { coreUserId: dto.coreUserId } : {}),
    };
    const { skip, take } = pageArgs(dto);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(rows, total, dto);
  }
}

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('v1/audit-logs')
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  @RequirePermissions(Permission.AUDIT_LOG_READ)
  @ApiOperation({ summary: 'ประวัติการใช้งานระบบ — ตารางนี้เขียนได้อย่างเดียว' })
  list(@Query() dto: ListAuditLogsDto) {
    return this.service.list(dto);
  }
}

@Module({ controllers: [AuditLogsController], providers: [AuditLogsService] })
export class AuditLogsModule {}
