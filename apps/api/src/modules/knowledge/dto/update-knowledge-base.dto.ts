import { IsString, IsOptional, IsNumber, Min, Max, IsInt } from 'class-validator';

export class UpdateKnowledgeBaseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(4096)
  maxTokens?: number;
}
