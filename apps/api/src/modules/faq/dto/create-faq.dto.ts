import { IsString, IsInt, IsOptional, MinLength, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFaqDto {
  @IsString()
  knowledgeBaseId!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  question!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  answer!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number = 0;
}
