import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export class CreateProjectDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  /** Public project key (e.g. "my-crm"). Generated from the name when omitted. */
  @IsOptional()
  @trim()
  @Matches(SLUG_PATTERN, {
    message: 'slug must be 1-50 lowercase letters, digits or hyphens (no leading/trailing hyphen)',
  })
  slug?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  description?: string;
}
