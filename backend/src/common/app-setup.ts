import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { AllExceptionsFilter } from './filters/http-exception.filter';

export function corsOrigins(config: ConfigService): string[] {
  return (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Socket.IO adapter that applies the same CORS allow-list as the REST API. */
class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly origins: string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origins, credentials: false },
    });
  }
}

/** Shared by main.ts and the e2e tests so both run the exact same HTTP/WebSocket setup. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const origins = corsOrigins(config);

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: origins, credentials: false });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useWebSocketAdapter(new CorsIoAdapter(app, origins));
}
