import { Body, Controller, Get, HttpCode, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/principals';
import { AuthUser } from '../common/types';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards';

/** Stricter rate limit for credential endpoints (brute-force protection). */
const AUTH_LIMIT = {
  // Resolved per request so values loaded from .env by ConfigModule are honoured.
  default: { limit: () => Number(process.env.AUTH_RATE_LIMIT_MAX ?? 20), ttl: 60_000 },
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Post('register')
  @Throttle(AUTH_LIMIT)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    const found = await this.users.findById(user.id);
    if (!found) throw new NotFoundException('User not found');
    return found;
  }
}
