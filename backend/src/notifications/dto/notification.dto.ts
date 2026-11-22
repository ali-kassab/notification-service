import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  NotificationPriority,
  NotificationTarget,
  NotificationType,
  RecipientStatus,
} from '@prisma/client';
import { BooleanQuery } from '../../common/dto/boolean-query';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { IsUserId } from '../../common/dto/user-id';

export const MAX_RECIPIENTS_PER_REQUEST = 1000;
export const MAX_METADATA_BYTES = 8 * 1024;

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Fields shared by every way of sending a notification. */
export class NotificationContentDto {
  /**
   * Optional public project key. The project is always taken from the API key; if this field
   * is given it must match, which protects against sending with the wrong key by mistake.
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  projectKey?: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  /** Free-form JSON object (e.g. { "orderId": "123", "url": "/orders/123" }), max 8 KB. */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/** Send to one user (`userId`) or a list of users (`userIds`) - exactly one of the two. */
export class SendNotificationDto extends NotificationContentDto {
  @IsOptional()
  @IsUserId()
  userId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_RECIPIENTS_PER_REQUEST)
  @IsUserId({ each: true })
  userIds?: string[];
}

export class BroadcastNotificationDto extends NotificationContentDto {}

/** Dashboard "send test notification": a single user, a list, or a broadcast. */
export class AdminSendNotificationDto extends SendNotificationDto {
  @IsOptional()
  @IsBoolean()
  broadcast?: boolean;
}

export class InboxQueryDto extends PaginationQueryDto {
  /** true = only unread, false = only read, omitted = all (full history). */
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  unread?: boolean;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}

export class AdminNotificationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @IsOptional()
  @IsEnum(NotificationTarget)
  target?: NotificationTarget;

  @IsOptional()
  @IsUserId()
  recipientId?: string;
}

export class AdminRecipientsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RecipientStatus)
  status?: RecipientStatus;
}

export class UserIdParam {
  @IsUserId()
  userId: string;
}

export class UserInboxItemParam extends UserIdParam {
  @IsUUID()
  id: string;
}
