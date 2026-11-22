import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './common/app-setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  const port = Number(app.get(ConfigService).get('PORT') ?? 3000);
  await app.listen(port);
  Logger.log(`Notification service listening on http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
