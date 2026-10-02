import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { RequestsService } from './requests.service';
import {
  CreateRequestDto,
  ListRequestsDto,
  RejectRequestDto,
  UpdateRequestDto,
} from './dto/request.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @ApiOperation({
    summary: 'รายการคำขอ — STUDENT เห็นของตัวเอง · TEACHER เห็นที่ตัวเองรับรอง · ADMIN เห็นทั้งหมด',
  })
  list(@Query() dto: ListRequestsDto, @CurrentUser() actor: AuthUser) {
    return this.requests.list(dto, actor);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.requests.findOne(id, actor);
  }

  @Post()
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'ยื่นคำขอใหม่ (studentId มาจาก token ไม่ใช่จาก body)' })
  create(@Body() dto: CreateRequestDto, @CurrentUser() actor: AuthUser) {
    return this.requests.create(dto, actor);
  }

  @Patch(':id')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'แก้ไขคำขอของตัวเอง (ได้เฉพาะตอนยังเป็น PENDING)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRequestDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.requests.update(id, dto, actor);
  }

  @Patch(':id/approve')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'อนุมัติคำขอ (เฉพาะอาจารย์ที่ถูกระบุ หรือ ADMIN)' })
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.requests.approve(id, actor);
  }

  @Patch(':id/reject')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'ปฏิเสธคำขอ — ต้องระบุ rejectReason' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectRequestDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.requests.reject(id, dto, actor);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'ยกเลิกคำขอของตัวเอง (PENDING หรือ APPROVED เท่านั้น)' })
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.requests.cancel(id, actor);
  }
}
