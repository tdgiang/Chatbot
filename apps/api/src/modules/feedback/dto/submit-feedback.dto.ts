import { IsString, IsInt, IsOptional, IsIn } from 'class-validator';

export class SubmitFeedbackDto {
  @IsString()
  message_id!: string;

  @IsString()
  session_id!: string;

  @IsInt()
  @IsIn([1, -1])
  rating!: 1 | -1;

  @IsOptional()
  @IsString()
  note?: string;
}
