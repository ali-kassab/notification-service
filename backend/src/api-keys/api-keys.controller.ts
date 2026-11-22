import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../common/decorators/principals';
import { AuthUser } from '../common/types';
import { ProjectsService } from '../projects/projects.service';
import { ApiKeysService } from './api-keys.service';

export class CreateApiKeyDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}

/** Dashboard management of a project's secret API keys. */
@Controller('projects/:projectId/api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly projects: ProjectsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    await this.projects.getOwned(projectId, user.id);
    return this.apiKeys.list(projectId);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    await this.projects.getOwned(projectId, user.id);
    return this.apiKeys.create(projectId, dto.name);
  }

  @Delete(':keyId')
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ) {
    await this.projects.getOwned(projectId, user.id);
    return this.apiKeys.revoke(projectId, keyId);
  }
}
