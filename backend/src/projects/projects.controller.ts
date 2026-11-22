import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../common/decorators/principals';
import { AuthUser } from '../common/types';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';
import { StatsService } from './stats.service';

/** Dashboard (administrative) project management. Requires a dashboard JWT. */
@Controller()
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly stats: StatsService,
  ) {}

  @Get('projects')
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user.id);
  }

  @Post('projects')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.id, dto);
  }

  @Get('projects/:projectId')
  get(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.projects.getOwned(projectId, user.id);
  }

  @Patch('projects/:projectId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(projectId, user.id, dto);
  }

  @Delete('projects/:projectId')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    await this.projects.remove(projectId, user.id);
  }

  @Get('projects/:projectId/stats')
  async projectStats(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    await this.projects.getOwned(projectId, user.id);
    return this.stats.forProjects([projectId]);
  }

  /** Aggregated statistics across all projects of the signed-in user. */
  @Get('stats/overview')
  async overview(@CurrentUser() user: AuthUser) {
    const owned = await this.projects.list(user.id);
    return {
      projectCount: owned.length,
      ...(await this.stats.forProjects(owned.map((p) => p.id))),
    };
  }
}
