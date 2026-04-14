import { IsEnum, IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { ChannelType } from '@prisma/client';

export class CreateIntegrationDto {
  @IsEnum(ChannelType)
  channel!: ChannelType;

  @IsString()
  name!: string;

  @IsString()
  knowledgeBaseId!: string;

  @IsObject()
  config!: Record<string, string>;

  @IsOptional()
  @IsString()
  webhookSecret?: string;
}
