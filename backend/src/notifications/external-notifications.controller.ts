import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { CurrentProject } from '../common/decorators/principals';
import { ApiKeyProject } from '../common/types';
import {
  BroadcastNotificationDto,
  InboxQueryDto,
  NotificationContentDto,
  SendNotificationDto,
  UserIdParam,
  UserInboxItemParam,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

function assertProjectKey(project: ApiKeyProject, dto: NotificationContentDto): void {
  if (dto.projectKey !== undefined && dto.projectKey !== project.slug) {
    throw new ForbiddenException('projectKey does not match the project of this API key');
  }
}

/**
 * External API for trusted backends (secret API key). Never call these from a browser.
 * The project is always derived from the API key.
 */
@Controller('notifications')
@UseGuards(ApiKeyGuard)
export class ExternalNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  send(@CurrentProject() project: ApiKeyProject, @Body() dto: SendNotificationDto) {
    assertProjectKey(project, dto);
    return this.notifications.send(project.id, dto);
  }

  @Post('broadcast')
  broadcast(@CurrentProject() project: ApiKeyProject, @Body() dto: BroadcastNotificationDto) {
    assertProjectKey(project, dto);
    return this.notifications.broadcast(project.id, dto);
  }
}

/** External API: read/manage a specific user's inbox from a trusted backend. */
@Controller('users/:userId/notifications')
@UseGuards(ApiKeyGuard)
export class ExternalUserInboxController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentProject() project: ApiKeyProject,
    @Param() { userId }: UserIdParam,
    @Query() query: InboxQueryDto,
  ) {
    return this.notifications.listInbox({ projectId: project.id, userId }, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentProject() project: ApiKeyProject, @Param() { userId }: UserIdParam) {
    return this.notifications.unreadCount({ projectId: project.id, userId });
  }

  @Patch('read-all')
  markAllRead(@CurrentProject() project: ApiKeyProject, @Param() { userId }: UserIdParam) {
    return this.notifications.markAllRead({ projectId: project.id, userId });
  }

  @Patch(':id/read')
  markRead(@CurrentProject() project: ApiKeyProject, @Param() { userId, id }: UserInboxItemParam) {
    return this.notifications.markRead({ projectId: project.id, userId }, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentProject() project: ApiKeyProject, @Param() { userId, id }: UserInboxItemParam) {
    await this.notifications.removeFromInbox({ projectId: project.id, userId }, id);
  }
}
