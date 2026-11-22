import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma/prisma.service';
import { EndUserPrincipal } from '../common/types';

export const END_USER_AUDIENCE = 'naas-end-user';

/**
 * Short-lived, restricted tokens for browser/mobile clients.
 * A trusted backend exchanges its secret API key for a token bound to ONE project + ONE user.
 * The token can only read/update that user's own inbox and subscribe to that user's
 * real-time room. It is signed with a different secret and audience than dashboard JWTs,
 * so neither kind of token can be used in place of the other.
 */
@Injectable()
export class UserTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issue(projectId: string, userId: string, expiresIn?: number) {
    const ttl = expiresIn ?? Number(this.config.get('USER_TOKEN_DEFAULT_TTL_SECONDS') ?? 3600);
    // Register the end user so they become part of the project's broadcast audience.
    await this.prisma.endUser.upsert({
      where: { projectId_externalId: { projectId, externalId: userId } },
      create: { projectId, externalId: userId },
      update: { lastSeenAt: new Date() },
    });
    const token = this.jwt.sign(
      { sub: userId, pid: projectId },
      { secret: this.secret(), expiresIn: ttl, audience: END_USER_AUDIENCE },
    );
    return { token, userId, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }

  verify(token: string): EndUserPrincipal {
    try {
      const p = this.jwt.verify<{ sub?: string; pid?: string }>(token, {
        secret: this.secret(),
        audience: END_USER_AUDIENCE,
      });
      if (!p.sub || !p.pid) throw new Error('malformed token');
      return { projectId: p.pid, userId: p.sub };
    } catch {
      throw new UnauthorizedException('Invalid or expired user token');
    }
  }

  private secret(): string {
    return this.config.getOrThrow<string>('USER_TOKEN_SECRET');
  }
}
