import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsUserId } from '../../common/dto/user-id';

export class CreateUserTokenDto {
  /** The integrating application's own user id. */
  @IsUserId()
  userId: string;

  /** Token lifetime in seconds (60s - 24h). Defaults to USER_TOKEN_DEFAULT_TTL_SECONDS. */
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  expiresIn?: number;
}
