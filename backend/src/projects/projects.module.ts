import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { StatsService } from './stats.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, StatsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
