import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { CurrentProject } from '../common/decorators/principals';
import { ApiKeyProject } from '../common/types';
import { CreateUserTokenDto } from './dto/user-token.dto';
import { UserTokenService } from './user-token.service';

/**
 * External (server-to-server) endpoint: a trusted backend exchanges its secret API key
 * for a restricted token that it can hand to its own logged-in user's browser.
 */
@Controller('user-tokens')
@UseGuards(ApiKeyGuard)
export class UserTokensController {
  constructor(private readonly tokens: UserTokenService) {}

  @Post()
  create(@CurrentProject() project: ApiKeyProject, @Body() dto: CreateUserTokenDto) {
    return this.tokens.issue(project.id, dto.userId, dto.expiresIn);
  }
}
