import { Body, Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, UserToken } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { CoreHubIdentity } from '../auth/core-hub-identity';
import { Permission } from '../auth/permissions';
import { UuidPipe } from '../common/pipes/uuid.pipe';
import { CreateStorageRequestDto, ListStorageRequestsDto, RejectStorageRequestDto } from './dto/storage-request.dto';
import { StorageRequestsService } from './storage-requests.service';

const P = Permission;

@ApiTags('storage')
@ApiBearerAuth()
@Controller('v1/storage-pools')
export class StoragePoolsController {
  constructor(private readonly storage: StorageRequestsService) {}

  @Get('current')
  @RequirePermissions(P.STORAGE_POOL_READ)
  @ApiOperation({ summary: 'พื้นที่รวมของ pool ที่เปิดให้ยืม — ทั้งหมด · จองแล้ว · เหลือ · ยืมเต็มได้อีกกี่ที่' })
  current() {
    return this.storage.poolSummary();
  }
}

@ApiTags('storage')
@ApiBearerAuth()
@Controller('v1/storage-requests')
export class StorageController {
  constructor(private readonly storage: StorageRequestsService) {}

  @Get()
  @RequirePermissions(P.STORAGE_READ_OWN, P.STORAGE_READ_ANY, P.STORAGE_REVIEW_OWN, P.STORAGE_REVIEW_ANY)
  @ApiOperation({ summary: 'รายการคำขอพื้นที่ — นักศึกษาเห็นของตัวเอง · อาจารย์เห็นที่ตัวเองพิจารณา · เจ้าหน้าที่เห็นทั้งหมด' })
  list(@Query() dto: ListStorageRequestsDto, @CurrentUser() user: CoreHubIdentity, @UserToken() token: string) {
    return this.storage.list(dto, { user, token });
  }

  @Get(':id')
  @RequirePermissions(P.STORAGE_READ_OWN, P.STORAGE_READ_ANY, P.STORAGE_REVIEW_OWN, P.STORAGE_REVIEW_ANY)
  findOne(@Param('id', UuidPipe) id: string, @CurrentUser() user: CoreHubIdentity, @UserToken() token: string) {
    return this.storage.findOne(id, { user, token });
  }

  @Get(':id/access')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(P.STORAGE_LINK_READ_OWN)
  @ApiOperation({ summary: 'ลิงก์และรหัสของพื้นที่ — เจ้าของเท่านั้น · ไม่ cache · บันทึก audit' })
  access(@Param('id', UuidPipe) id: string, @CurrentUser() user: CoreHubIdentity, @UserToken() token: string) {
    return this.storage.revealLink(id, { user, token });
  }

  @Post()
  @RequirePermissions(P.STORAGE_CREATE_OWN)
  @ApiOperation({ summary: 'ยื่นคำขอยืมพื้นที่ (ไม่เกินเพดานต่อคนของ pool)' })
  create(@Body() dto: CreateStorageRequestDto, @CurrentUser() user: CoreHubIdentity, @UserToken() token: string) {
    return this.storage.create(dto, { user, token });
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(P.STORAGE_REVIEW_OWN, P.STORAGE_REVIEW_ANY)
  @ApiOperation({ summary: 'อนุมัติ = จองพื้นที่ + สร้างพื้นที่ที่ cloud · pool ไม่พอ → 409 POOL_FULL' })
  approve(@Param('id', UuidPipe) id: string, @CurrentUser() user: CoreHubIdentity, @UserToken() token: string) {
    return this.storage.approve(id, { user, token });
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions(P.STORAGE_REVIEW_OWN, P.STORAGE_REVIEW_ANY)
  reject(
    @Param('id', UuidPipe) id: string,
    @Body() dto: RejectStorageRequestDto,
    @CurrentUser() user: CoreHubIdentity,
    @UserToken() token: string,
  ) {
    return this.storage.reject(id, dto, { user, token });
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions(P.STORAGE_CANCEL_OWN)
  cancel(@Param('id', UuidPipe) id: string, @CurrentUser() user: CoreHubIdentity, @UserToken() token: string) {
    return this.storage.cancel(id, { user, token });
  }

  @Post(':id/retry-provision')
  @HttpCode(200)
  @RequirePermissions(P.STORAGE_PROVISION_RETRY)
  @ApiOperation({ summary: 'สั่งสร้างพื้นที่ใหม่หลัง provider ล้ม (เจ้าหน้าที่)' })
  retry(@Param('id', UuidPipe) id: string, @CurrentUser() user: CoreHubIdentity, @UserToken() token: string) {
    return this.storage.retryProvision(id, { user, token });
  }
}
