import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../common/decorators/principals';
import { AuthUser } from '../common/types';
import { ProjectsService } from '../projects/projects.service';
import {
  AdminNotificationsQueryDto,
  AdminRecipientsQueryDto,
  AdminSendNotificationDto,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

/** Dashboard (administrative) notification history and test sending for an owned project. */
@Controller('projects/:projectId/notifications')
@UseGuards(JwtAuthGuard)
export class AdminNotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly projects: ProjectsService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: AdminNotificationsQueryDto,
  ) {
    await this.projects.getOwned(projectId, user.id);
    return this.notifications.listForProject(projectId, query);
  }

  @Get(':notificationId')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @Query() query: AdminRecipientsQueryDto,
  ) {
    await this.projects.getOwned(projectId, user.id);
    return this.notifications.getForProject(projectId, notificationId, query);
  }

  /** Send a (test) notification from the dashboard: userId, userIds or broadcast=true. */
  @Post()
  async send(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: AdminSendNotificationDto,
  ) {
    await this.projects.getOwned(projectId, user.id);
    const { broadcast, ...rest } = dto;
    return broadcast
      ? this.notifications.broadcast(projectId, rest)
      : this.notifications.send(projectId, rest);
  }

  @Delete(':notificationId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    await this.projects.getOwned(projectId, user.id);
    await this.notifications.removeForProject(projectId, notificationId);
  }
}
