import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Project } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list(ownerId: string) {
    return this.prisma.project.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { notifications: true, endUsers: true, apiKeys: true } } },
    });
  }

  async create(ownerId: string, dto: CreateProjectDto): Promise<Project> {
    const slug = dto.slug ?? this.slugify(dto.name);
    try {
      return await this.prisma.project.create({
        data: { ownerId, name: dto.name, slug, description: dto.description },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Project key "${slug}" is already taken`);
      }
      throw e;
    }
  }

  /**
   * Returns the project only if it belongs to the given dashboard user.
   * Projects of other users are reported as "not found" so their existence is not leaked.
   */
  async getOwned(projectId: string, ownerId: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, ownerId } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(projectId: string, ownerId: string, dto: UpdateProjectDto): Promise<Project> {
    await this.getOwned(projectId, ownerId);
    return this.prisma.project.update({ where: { id: projectId }, data: dto });
  }

  async remove(projectId: string, ownerId: string): Promise<void> {
    await this.getOwned(projectId, ownerId);
    await this.prisma.project.delete({ where: { id: projectId } });
  }

  private slugify(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '');
    // Random suffix keeps generated keys unique without a lookup loop.
    return `${base || 'project'}-${randomBytes(3).toString('hex')}`;
  }
}
