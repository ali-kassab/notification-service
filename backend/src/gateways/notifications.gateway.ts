import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { bearerToken } from '../auth/guards';
import { UserTokenService } from '../auth/user-token.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { EndUserPrincipal } from '../common/types';

/** Ack timeout for real-time events. An event only counts as delivered if a client acks it. */
export const ACK_TIMEOUT_MS = 5000;

/**
 * One room per (project, user). projectId is a fixed-length UUID, so room names are unambiguous
 * and a user id can never collide with another project's room.
 */
export function userRoom(projectId: string, userId: string): string {
  return `project:${projectId}:user:${userId}`;
}

/**
 * Socket.IO gateway, namespace `/notifications`.
 *
 * Clients connect with a restricted user token (issued via POST /api/v1/user-tokens):
 *   io(`${baseUrl}/notifications`, { auth: { token } })
 * The server - never the client - decides which room a socket joins, based solely on the
 * verified token. There is no "join room" message, so a client cannot subscribe to another
 * user's or project's notifications.
 */
@WebSocketGateway({ namespace: '/notifications' })
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server: Namespace;

  constructor(
    private readonly tokens: UserTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    let principal: EndUserPrincipal;
    try {
      const auth = client.handshake.auth as { token?: unknown } | undefined;
      const token =
        typeof auth?.token === 'string'
          ? auth.token
          : bearerToken(client.handshake.headers.authorization);
      if (!token) throw new Error('missing token');
      principal = this.tokens.verify(token);
      const project = await this.prisma.project.findUnique({
        where: { id: principal.projectId },
        select: { id: true },
      });
      if (!project) throw new Error('project no longer exists');
    } catch {
      client.emit('auth_error', { message: 'Invalid or expired user token' });
      client.disconnect(true);
      return;
    }

    client.data.principal = principal;
    await client.join(userRoom(principal.projectId, principal.userId));
    const unreadCount = await this.prisma.notificationRecipient.count({
      where: { projectId: principal.projectId, recipientId: principal.userId, readAt: null },
    });
    client.emit('ready', { userId: principal.userId, unreadCount });
  }

  /** True when at least one socket of this user is currently connected (to this instance). */
  isOnline(projectId: string, userId: string): boolean {
    return (this.server?.adapter.rooms.get(userRoom(projectId, userId))?.size ?? 0) > 0;
  }

  /** Fire-and-forget event to all sockets of one user. */
  emitToUser(projectId: string, userId: string, event: string, payload: unknown): void {
    this.server?.to(userRoom(projectId, userId)).emit(event, payload);
  }

  /**
   * Emits an event and resolves true only if at least one of the user's sockets acknowledged it
   * within ACK_TIMEOUT_MS. Resolves false immediately when the user has no connected socket.
   */
  emitWithAck(projectId: string, userId: string, event: string, payload: unknown): Promise<boolean> {
    if (!this.isOnline(projectId, userId)) return Promise.resolve(false);
    return new Promise((resolve) => {
      this.server
        .to(userRoom(projectId, userId))
        .timeout(ACK_TIMEOUT_MS)
        .emit(event, payload, (err: Error | null, responses: unknown[]) => {
          if (err && !responses?.length) {
            this.logger.debug(`No ack for ${event} to ${userId}`);
          }
          resolve(Array.isArray(responses) && responses.length > 0);
        });
    });
  }
}
