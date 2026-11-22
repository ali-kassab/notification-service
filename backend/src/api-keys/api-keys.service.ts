import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { generateApiKey, hashApiKey } from '../common/crypto';
import { ApiKeyProject } from '../common/types';

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  list(projectId: string) {
    return this.prisma.apiKey.findMany({
      where: { projectId },
      select: PUBLIC_FIELDS,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Creates a key. The plain key is returned ONCE here and never stored or shown again. */
  async create(projectId: string, name: string) {
    const key = generateApiKey();
    const record = await this.prisma.apiKey.create({
      data: { projectId, name, prefix: key.slice(0, 12), keyHash: hashApiKey(key) },
      select: PUBLIC_FIELDS,
    });
    return { ...record, key };
  }

  async revoke(projectId: string, keyId: string) {
    const existing = await this.prisma.apiKey.findFirst({ where: { id: keyId, projectId } });
    if (!existing) throw new NotFoundException('API key not found');
    if (existing.revokedAt) {
      return this.prisma.apiKey.findUniqueOrThrow({ where: { id: keyId }, select: PUBLIC_FIELDS });
    }
    return this.prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
      select: PUBLIC_FIELDS,
    });
  }

  /** Resolves a plain key to its project; returns null for unknown or revoked keys. */
  async authenticate(plainKey: string): Promise<ApiKeyProject | null> {
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(plainKey) },
      include: { project: { select: { id: true, slug: true } } },
    });
    if (!key || key.revokedAt) return null;
    // Best-effort usage tracking; never blocks or fails the request.
    this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return { id: key.project.id, slug: key.project.slug, apiKeyId: key.id };
  }
}
