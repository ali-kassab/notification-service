import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { GatewayModule } from './gateways/gateway.module';
import { NotificationDeliveryModule } from './notification-delivery/notification-delivery.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProjectsModule } from './projects/projects.module';
import { UsersModule } from './users/users.module';

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'USER_TOKEN_SECRET'];

function validateEnv(env: Record<string, unknown>) {
  const missing = REQUIRED_ENV.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  if (env.JWT_SECRET === env.USER_TOKEN_SECRET) {
    throw new Error('JWT_SECRET and USER_TOKEN_SECRET must be different');
  }
  return env;
}

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get('RATE_LIMIT_TTL_MS') ?? 60_000),
          limit: Number(config.get('RATE_LIMIT_MAX') ?? 300),
        },
      ],
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    ProjectsModule,
    ApiKeysModule,
    GatewayModule,
    NotificationDeliveryModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
