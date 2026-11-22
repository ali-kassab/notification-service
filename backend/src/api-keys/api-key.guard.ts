import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { bearerToken } from '../auth/guards';
import { API_KEY_PREFIX } from '../common/crypto';
import { AppRequest } from '../common/types';
import { ApiKeysService } from './api-keys.service';

/**
 * Authenticates external (server-to-server) requests with a secret project API key,
 * sent as `x-api-key: nsk_...` or `Authorization: Bearer nsk_...`.
 * The resolved project is attached to the request; every query is then scoped to it.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const header = req.headers['x-api-key'];
    const key = (Array.isArray(header) ? header[0] : header) ?? bearerToken(req.headers.authorization);
    if (!key || !key.startsWith(API_KEY_PREFIX)) {
      throw new UnauthorizedException('Missing or malformed API key');
    }
    const project = await this.apiKeys.authenticate(key);
    if (!project) throw new UnauthorizedException('Invalid or revoked API key');
    req.project = project;
    return true;
  }
}
