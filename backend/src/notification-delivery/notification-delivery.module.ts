import { Module } from '@nestjs/common';
import { GatewayModule } from '../gateways/gateway.module';
import { NotificationDeliveryService } from './notification-delivery.service';

@Module({
  imports: [GatewayModule],
  providers: [NotificationDeliveryService],
  exports: [NotificationDeliveryService],
})
export class NotificationDeliveryModule {}
