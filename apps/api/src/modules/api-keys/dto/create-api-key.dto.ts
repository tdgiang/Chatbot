import { IsString, IsOptional, IsArray, IsInt, Min, Max } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  name!: string;

  @IsString()
  knowledgeBaseId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  rateLimit?: number;
}
