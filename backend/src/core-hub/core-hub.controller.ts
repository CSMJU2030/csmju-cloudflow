import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationDto, paginated, pageArgs } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { UserToken } from '../auth/decorators/current-user.decorator';
import { Permission } from '../auth/permissions';
import { CoreHubClient } from './core-hub.client';
import { PeopleService } from './people.service';
import { ReferenceDataService } from './reference-data.service';

class ListCoursesDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'ค้นใน code และชื่อวิชา' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

/**
 * หน้าเว็บเรียก Core Hub ตรงไม่ได้ (ไม่เปิด CORS) — ระบบนี้เปิด endpoint ของตัวเองที่อ่านจาก cache/Core Hub ให้
 */
@ApiTags('core-hub')
@ApiBearerAuth()
@Controller('v1')
export class CoreHubController {
  constructor(
    private readonly reference: ReferenceDataService,
    private readonly people: PeopleService,
  ) {}

  @Get('courses')
  @RequirePermissions(Permission.COURSE_READ)
  @ApiOperation({ summary: 'รายวิชาที่ยังเปิดใช้ (จาก cache ข้อมูลกลางของ Core Hub)' })
  async courses(@Query() dto: ListCoursesDto, @UserToken() token: string) {
    let rows;
    try {
      rows = await this.reference.listCourses(token);
    } catch (e) {
      return CoreHubClient.toHttp(e);
    }
    const q = dto.q?.trim().toLowerCase();
    const filtered = rows
      .filter((c) => c.isActive)
      .filter((c) => !q || c.code.toLowerCase().includes(q) || c.nameTh.toLowerCase().includes(q) || (c.nameEn ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.code.localeCompare(b.code));
    const { skip, take } = pageArgs(dto);
    return paginated(
      filtered.slice(skip, skip + take).map(({ code, nameTh, nameEn, credits }) => ({ code, nameTh, nameEn, credits })),
      filtered.length,
      dto,
    );
  }

  @Get('advisors')
  @RequirePermissions(Permission.REQUEST_CREATE_OWN)
  @ApiOperation({ summary: 'อาจารย์ที่ปรึกษาของผู้เรียก (จาก Core Hub /people/me · ไม่ cache)' })
  async advisors(@UserToken() token: string) {
    const advisors = (await this.people.me(token))?.advisors ?? [];
    return paginated(advisors, advisors.length, { page: 1, limit: 100 });
  }
}
