import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'natdanai@mju.ac.th' })
  @IsEmail({}, { message: 'email ต้องเป็นอีเมลที่ถูกต้อง' })
  email: string;

  @ApiProperty({ example: 'Passw0rd!' })
  @IsString()
  @IsNotEmpty({ message: 'password ห้ามว่าง' })
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: '6704101323' })
  @IsString()
  @Matches(/^\d{8,20}$/, { message: 'studentCode ต้องเป็นตัวเลข 8–20 หลัก' })
  studentCode: string;

  @ApiProperty({ example: 'ณัฐดนัย ใจงาม' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName: string;

  @ApiProperty({ example: 'new.student@mju.ac.th' })
  @IsEmail({}, { message: 'email ต้องเป็นอีเมลที่ถูกต้อง' })
  @MaxLength(150)
  email: string;

  @ApiProperty({ example: 'Passw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'password ต้องยาวอย่างน้อย 8 ตัวอักษร' })
  @MaxLength(72, { message: 'password ยาวได้ไม่เกิน 72 ตัวอักษร (ข้อจำกัดของ bcrypt)' })
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'newPassword ต้องยาวอย่างน้อย 8 ตัวอักษร' })
  @MaxLength(72)
  newPassword: string;
}

export class AuthUserView {
  @ApiProperty() id: number;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
  @ApiProperty() role: string;
  @ApiPropertyOptional() studentCode?: string;
}
