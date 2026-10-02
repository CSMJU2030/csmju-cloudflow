import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateUserDto {
  @ApiPropertyOptional({ description: 'จำเป็นเมื่อ role = STUDENT' })
  @IsOptional()
  @Matches(/^\d{8,20}$/, { message: 'studentCode ต้องเป็นตัวเลข 8–20 หลัก' })
  studentCode?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName: string;

  @ApiProperty()
  @IsEmail({}, { message: 'email ต้องเป็นอีเมลที่ถูกต้อง' })
  @MaxLength(150)
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'password ต้องยาวอย่างน้อย 8 ตัวอักษร' })
  @MaxLength(72)
  password: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole, { message: 'role ต้องเป็น STUDENT, TEACHER หรือ ADMIN' })
  role: UserRole;
}

export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password'] as const)) {}

export class ListUsersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole, { message: 'role ต้องเป็น STUDENT, TEACHER หรือ ADMIN' })
  role?: UserRole;

  @ApiPropertyOptional({ description: 'ค้นจากชื่อ อีเมล หรือรหัสนักศึกษา' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
