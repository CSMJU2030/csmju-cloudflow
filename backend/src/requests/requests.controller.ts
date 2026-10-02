import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, UserToken } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { CoreHubIdentity } from '../auth/core-hub-identity';
import { Permission } from '../auth/permissions';
import { UuidPipe } from '../common/pipes/uuid.pipe';
import { CreateRequestDto, ListRequestsDto, RejectRequestDto, UpdateRequestDto } from './dto/request.dto';
import { RequestsService } from './requests.service';

const P = Permission;

@ApiTags('requests')
@ApiBearerAuth()
@Controller('v1/requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @RequirePermissions(P.REQUEST_READ_OWN, P.REQUEST_READ_ANY, P.REQUEST_REVIEW_OWN)
  @ApiOperation({ summary: 'รายการคำขอ — นักศึกษาเห็นของตัวเอง · อาจารย์เห็นที่ตัวเองรับรอง · เจ้าหน้าที่เห็นทั้งหมด' })
  list(@Query() dto: ListRequestsDto, @CurrentUser() user: CoreHubIdentity, @UserToken() token: string) {
    return this.requests.list(dto, { user, token });
  }

  @Get(':id')
  @RequirePermissions(P.REQUEST_READ_OWN, P.REQUEST_READ_ANY, P.REQUEST_REVIEW_OWN)
  findOne(@Param('id', UuidPipe) id: string, @CurrentUser() user: CoreHubIdentity, @UserToken() token: string) {
    return this.requests.findOne(id, { user, token });
  }

  @Post()
  @RequirePermissions(P.REQUEST_CREATE_OWN)
  @ApiOperation({ summary: 'ยื่นคำขอใหม่ (ผู้ยื่นมาจาก token ไม่ใช่จาก body)' })
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: CoreHubIdentity, @UserToken() token: string) {
    return this.requests.create(dto, { user, token });
  }

  @Patch(':id')
  @RequirePermissions(P.REQUEST_UPDATE_OWN)
  @ApiOperation({ summary: 'แก้ไขคำขอของตัวเอง (ได้เฉพาะตอนยังเป็น PENDING)' })
  update(
    @Param('id', UuidPipe) id: string,
    @Body() dto: UpdateRequestDto,
    @CurrentUser() user: CoreHubIdentity,
    @UserToken() token: string,
  ) {
    return this.requests.update(id, dto, { user, token });
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(P.REQUEST_REVIEW_OWN, P.REQUEST_REVIEW_ANY)
  @ApiOperation({ summary: 'อนุมัติคำขอ (อาจารย์ที่ถูกระบุ หรือเจ้าหน้าที่)' })
  approve(@Param('id', UuidPipe) id: string, @CurrentUser() user: CoreHubIdentity, @UserToken() token: string) {
    return this.requests.approve(id, { user, token });
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions(P.REQUEST_REVIEW_OWN, P.REQUEST_REVIEW_ANY)
  @ApiOperation({ summary: 'ปฏิเสธคำขอ — ต้องระบุ rejectReason' })
  reject(
    @Param('id', UuidPipe) id: string,
    @Body() dto: RejectRequestDto,
    @CurrentUser() user: CoreHubIdentity,
    @UserToken() token: string,
  ) {
    return this.requests.reject(id, dto, { user, token });
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions(P.REQUEST_CANCEL_OWN, P.REQUEST_CANCEL_ANY)
  @ApiOperation({ summary: 'ยกเลิกคำขอ (PENDING หรือ APPROVED เท่านั้น)' })
  cancel(@Param('id', UuidPipe) id: string, @CurrentUser() user: CoreHubIdentity, @UserToken() token: string) {
    return this.requests.cancel(id, { user, token });
  }
}
