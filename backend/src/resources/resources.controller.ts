import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ResourcesService } from './resources.service';
import { CreateResourceDto, ListResourcesDto, UpdateResourceDto } from './dto/resource.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('resources')
@ApiBearerAuth()
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get('usage')
  @ApiOperation({ summary: 'ทรัพยากรคงเหลือของทุกเครื่อง (คำนวณสดจาก view)' })
  usage() {
    return this.resources.usage();
  }

  @Get()
  @ApiOperation({ summary: 'รายการเครื่องทั้งหมด' })
  list(@Query() dto: ListResourcesDto) {
    return this.resources.list(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.resources.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateResourceDto, @CurrentUser() actor: AuthUser) {
    return this.resources.create(dto, actor.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateResourceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.resources.update(id, dto, actor.id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.resources.remove(id, actor.id);
  }
}
