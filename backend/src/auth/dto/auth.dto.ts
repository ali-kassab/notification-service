import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class RegisterDto {
  @trim()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class LoginDto {
  @trim()
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}
