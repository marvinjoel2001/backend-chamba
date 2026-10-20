import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export const WEB_REPORT_CATEGORIES = ['usuario', 'estafa', 'bug', 'otro'] as const;

export class WebReportDto {
  @ApiProperty({ enum: WEB_REPORT_CATEGORIES })
  @IsIn(WEB_REPORT_CATEGORIES)
  category: (typeof WEB_REPORT_CATEGORIES)[number];

  @ApiProperty({ example: 'persona@gmail.com' })
  @IsEmail()
  @MaxLength(200)
  email: string;

  @ApiProperty({ example: 'El trabajador cobró más de lo acordado…' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message: string;
}

export class WebSubscribeDto {
  @ApiProperty({ example: 'persona@gmail.com' })
  @IsEmail()
  @MaxLength(200)
  email: string;
}
