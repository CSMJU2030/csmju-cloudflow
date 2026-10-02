import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { AllocationsService } from './allocations.service';
import { CreateAllocationDto, ListAllocationsDto, ReleaseAllocationDto } from './dto/allocation.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('allocations')
@ApiBearerAuth()
@Controller('allocations')
export class AllocationsController {
  constructor(private readonly allocations: AllocationsService) {}

  @Get()
  @ApiOperation({ summary: 'รายการการจัดสรร — ADMIN เห็นทั้งหมด · คนอื่นเห็นเฉพาะของตัวเอง' })
  list(@Query() dto: ListAllocationsDto, @CurrentUser() actor: AuthUser) {
    return this.allocations.list(dto, actor);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.allocations.findOne(id, actor);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'จัดสรรเครื่องให้คำขอที่ APPROVED (คำขอเลื่อนเป็น ALLOCATED อัตโนมัติ)' })
  create(@Body() dto: CreateAllocationDto, @CurrentUser() actor: AuthUser) {
    return this.allocations.create(dto, actor);
  }

  @Patch(':id/release')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'คืนเครื่อง — ประทับ releasedAt (ไม่ลบแถว ประวัติจึงยังอยู่)' })
  release(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReleaseAllocationDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.allocations.release(id, dto, actor);
  }
}
