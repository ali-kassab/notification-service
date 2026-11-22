import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Ids of the integrating application's users: 1-191 chars of letters, digits and . _ : @ | - */
export const USER_ID_PATTERN = /^[A-Za-z0-9._:@|-]{1,191}$/;
const MESSAGE = 'userId must be 1-191 characters: letters, digits and . _ : @ | -';

export function IsUserId(options: { each?: boolean } = {}) {
  return applyDecorators(
    IsString(options),
    MinLength(1, options),
    MaxLength(191, options),
    Matches(USER_ID_PATTERN, { ...options, message: MESSAGE }),
  );
}
