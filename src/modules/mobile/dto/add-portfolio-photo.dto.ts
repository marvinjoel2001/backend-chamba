import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AddPortfolioPhotoDto {
  @IsString()
  @MaxLength(7 * 1024 * 1024)
  imageBase64: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;
}
