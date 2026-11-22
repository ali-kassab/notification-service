import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AppRequest } from '../common/types';
import { AuthService } from './auth.service';
import { UserTokenService } from './user-token.service';

export function bearerToken(header: string | undefined): string | undefined {
  const [scheme, token] = (header ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

function requireBearer(req: AppRequest): string {
  const token = bearerToken(req.headers.authorization);
  if (!token) throw new UnauthorizedException('Missing bearer token');
  return token;
}

/** Protects dashboard (administrative) routes with a dashboard JWT. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    req.user = this.auth.verify(requireBearer(req));
    return true;
  }
}

/** Protects end-user (browser) routes with a short-lived user token. */
@Injectable()
export class EndUserGuard implements CanActivate {
  constructor(private readonly tokens: UserTokenService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    req.endUser = this.tokens.verify(requireBearer(req));
    return true;
  }
}
