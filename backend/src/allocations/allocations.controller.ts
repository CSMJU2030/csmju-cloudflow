import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { CoreHubIdentity } from '../auth/core-hub-identity';
import { Permission } from '../auth/permissions';
import { UuidPipe } from '../common/pipes/uuid.pipe';
import { AllocationsService } from './allocations.service';
import { CreateAllocationDto, ListAllocationsDto, ReleaseAllocationDto } from './dto/allocation.dto';

const P = Permission;

@ApiTags('allocations')
@ApiBearerAuth()
@Controller('v1/allocations')
export class AllocationsController {
  constructor(private readonly allocations: AllocationsService) {}

  @Get()
  @RequirePermissions(P.ALLOCATION_READ_OWN, P.ALLOCATION_READ_ANY)
  @ApiOperation({ summary: 'รายการการจัดสรร — เจ้าหน้าที่เห็นทั้งหมด · นักศึกษาเห็นของตัวเอง' })
  list(@Query() dto: ListAllocationsDto, @CurrentUser() user: CoreHubIdentity) {
    return this.allocations.list(dto, user);
  }

  @Get(':id')
  @RequirePermissions(P.ALLOCATION_READ_OWN, P.ALLOCATION_READ_ANY)
  findOne(@Param('id', UuidPipe) id: string, @CurrentUser() user: CoreHubIdentity) {
    return this.allocations.findOne(id, user);
  }

  @Post()
  @RequirePermissions(P.ALLOCATION_CREATE)
  @ApiOperation({ summary: 'จัดสรรเครื่องให้คำขอที่ APPROVED (คำขอเลื่อนเป็น ALLOCATED อัตโนมัติ)' })
  create(@Body() dto: CreateAllocationDto, @CurrentUser() user: CoreHubIdentity) {
    return this.allocations.create(dto, user);
  }

  @Post(':id/release')
  @HttpCode(200)
  @RequirePermissions(P.ALLOCATION_RELEASE)
  @ApiOperation({ summary: 'คืนเครื่อง — ประทับ releasedAt (ไม่ลบแถว ประวัติจึงยังอยู่)' })
  release(@Param('id', UuidPipe) id: string, @Body() dto: ReleaseAllocationDto, @CurrentUser() user: CoreHubIdentity) {
    return this.allocations.release(id, dto, user);
  }
}
