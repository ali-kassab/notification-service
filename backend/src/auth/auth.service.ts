import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../common/types';
import { PublicUser, UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;
export const DASHBOARD_AUDIENCE = 'naas-dashboard';

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
}

/** Registration/login for dashboard accounts. Passwords are hashed with bcrypt. */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('An account with this email already exists');
    }
    const hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.users.create(dto.email, dto.name, hash);
    return { accessToken: this.sign(user), user };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    // Same error for unknown email and wrong password so accounts cannot be enumerated.
    const ok = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');
    const { id, email, name, createdAt } = user;
    return { accessToken: this.sign(user), user: { id, email, name, createdAt } };
  }

  /** Verifies a dashboard JWT. Throws UnauthorizedException when invalid. */
  verify(token: string): AuthUser {
    try {
      const payload = this.jwt.verify<{ sub: string; email: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        audience: DASHBOARD_AUDIENCE,
      });
      return { id: payload.sub, email: payload.email };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private sign(user: { id: string; email: string }): string {
    return this.jwt.sign(
      { sub: user.id, email: user.email },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ?? '1d') as any,
        audience: DASHBOARD_AUDIENCE,
      },
    );
  }
}
