import { IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateChunkDto {
  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  content!: string;
}
