import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EndUserGuard } from '../auth/guards';
import { CurrentEndUser } from '../common/decorators/principals';
import { EndUserPrincipal } from '../common/types';
import { InboxQueryDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

/**
 * Browser-safe API. Authenticated with a short-lived user token, so it can only ever see
 * the inbox of the single user (in the single project) that the token was issued for.
 * There are deliberately no send/broadcast endpoints here.
 */
@Controller('client/notifications')
@UseGuards(EndUserGuard)
export class ClientNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentEndUser() user: EndUserPrincipal, @Query() query: InboxQueryDto) {
    return this.notifications.listInbox(user, query, true);
  }

  @Get('unread-count')
  unreadCount(@CurrentEndUser() user: EndUserPrincipal) {
    return this.notifications.unreadCount(user);
  }

  @Patch('read-all')
  markAllRead(@CurrentEndUser() user: EndUserPrincipal) {
    return this.notifications.markAllRead(user);
  }

  @Patch(':id/read')
  markRead(@CurrentEndUser() user: EndUserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentEndUser() user: EndUserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.removeFromInbox(user, id);
  }
}
