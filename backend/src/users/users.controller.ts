import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { UsersService } from './users.service';
import { CreateUserDto, ListUsersDto, UpdateUserDto } from './dto/user.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // วางไว้ก่อน :id — ไม่งั้น "teachers" จะถูกจับเป็น id แล้วพัง
  @Get('teachers')
  @ApiOperation({ summary: 'รายชื่ออาจารย์ (ใช้เลือกผู้รับรองตอนยื่นคำขอ)' })
  listTeachers() {
    return this.users.listTeachers();
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'รายชื่อผู้ใช้ทั้งหมด (ADMIN)' })
  list(@Query() dto: ListUsersDto) {
    return this.users.list(dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.users.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'สร้างผู้ใช้ (ADMIN) — สร้าง TEACHER/ADMIN ได้ที่นี่เท่านั้น' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.update(id, dto, actor.id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.users.remove(id, actor.id);
  }
}
