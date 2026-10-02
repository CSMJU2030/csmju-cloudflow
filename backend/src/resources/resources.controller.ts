import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { CoreHubIdentity } from '../auth/core-hub-identity';
import { Permission } from '../auth/permissions';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UuidPipe } from '../common/pipes/uuid.pipe';
import { CreateResourceDto, ListResourcesDto, UpdateResourceDto } from './dto/resource.dto';
import { ResourcesService } from './resources.service';

@ApiTags('resources')
@ApiBearerAuth()
@Controller('v1')
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get('resource-usages')
  @RequirePermissions(Permission.RESOURCE_READ)
  @ApiOperation({ summary: 'ทรัพยากรคงเหลือของทุกเครื่อง (คำนวณสดจาก view)' })
  usage(@Query() dto: PaginationDto) {
    return this.resources.usage(dto);
  }

  @Get('resources')
  @RequirePermissions(Permission.RESOURCE_READ)
  @ApiOperation({ summary: 'รายการเครื่องทั้งหมด' })
  list(@Query() dto: ListResourcesDto) {
    return this.resources.list(dto);
  }

  @Get('resources/:id')
  @RequirePermissions(Permission.RESOURCE_READ)
  findOne(@Param('id', UuidPipe) id: string) {
    return this.resources.findOne(id);
  }

  @Post('resources')
  @RequirePermissions(Permission.RESOURCE_CREATE)
  create(@Body() dto: CreateResourceDto, @CurrentUser() user: CoreHubIdentity) {
    return this.resources.create(dto, user.id);
  }

  @Patch('resources/:id')
  @RequirePermissions(Permission.RESOURCE_UPDATE)
  update(@Param('id', UuidPipe) id: string, @Body() dto: UpdateResourceDto, @CurrentUser() user: CoreHubIdentity) {
    return this.resources.update(id, dto, user.id);
  }

  @Delete('resources/:id')
  @RequirePermissions(Permission.RESOURCE_DELETE)
  remove(@Param('id', UuidPipe) id: string, @CurrentUser() user: CoreHubIdentity) {
    return this.resources.remove(id, user.id);
  }
}
