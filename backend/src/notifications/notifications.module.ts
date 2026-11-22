import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { NotificationDeliveryModule } from '../notification-delivery/notification-delivery.module';
import { ProjectsModule } from '../projects/projects.module';
import { AdminNotificationsController } from './admin-notifications.controller';
import { ClientNotificationsController } from './client-notifications.controller';
import {
  ExternalNotificationsController,
  ExternalUserInboxController,
} from './external-notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [ApiKeysModule, ProjectsModule, NotificationDeliveryModule],
  controllers: [
    ExternalNotificationsController,
    ExternalUserInboxController,
    ClientNotificationsController,
    AdminNotificationsController,
  ],
  providers: [NotificationsService],
})
export class NotificationsModule {}
