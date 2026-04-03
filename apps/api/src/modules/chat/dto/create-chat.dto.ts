import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateChatDto {
  @IsOptional()
  @IsString()
  session_id?: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsBoolean()
  stream?: boolean;
}
