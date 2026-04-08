import { IsString, IsInt, IsOptional, MinLength, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateFaqDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  question?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  answer?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;
}
