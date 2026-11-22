import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'createdAt'>;

const PUBLIC_FIELDS = { id: true, email: true, name: true, createdAt: true } as const;

/** Dashboard accounts (developers/operators who own projects). */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({ where: { id }, select: PUBLIC_FIELDS });
  }

  create(email: string, name: string, passwordHash: string): Promise<PublicUser> {
    return this.prisma.user.create({
      data: { email: email.toLowerCase(), name, passwordHash },
      select: PUBLIC_FIELDS,
    });
  }
}
