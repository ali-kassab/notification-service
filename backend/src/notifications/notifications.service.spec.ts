import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService (unit)', () => {
  const prisma: any = { $transaction: jest.fn() };
  const delivery: any = { deliver: jest.fn().mockResolvedValue(undefined) };
  const service = new NotificationsService(prisma, delivery);
  const content = { title: 't', message: 'm' };

  beforeEach(() => jest.clearAllMocks());

  it('requires exactly one of userId / userIds', () => {
    expect(() => service.send('p', content)).toThrow(BadRequestException);
    expect(() => service.send('p', { ...content, userId: 'a', userIds: ['b'] })).toThrow(BadRequestException);
  });

  it('rejects oversized metadata before touching the database', async () => {
    await expect(
      service.send('p', { ...content, userId: 'a', metadata: { big: 'x'.repeat(10_000) } }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('persists before attempting delivery and deduplicates recipients', async () => {
    const order: string[] = [];
    const notification = { id: 'n1', createdAt: new Date() };
    const tx = {
      endUser: { createMany: jest.fn() },
      notification: { create: jest.fn().mockResolvedValue(notification) },
      notificationRecipient: {
        createManyAndReturn: jest.fn().mockImplementation(({ data }) =>
          data.map((d: any, i: number) => ({ ...d, id: `r${i}`, status: 'STORED', readAt: null, deliveredAt: null })),
        ),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: any) => {
      const result = await fn(tx);
      order.push('persisted');
      return result;
    });
    delivery.deliver.mockImplementation(async () => order.push('delivered'));

    const res = await service.send('p', { ...content, userIds: ['a', 'b', 'a'] });

    expect(res).toMatchObject({ id: 'n1', status: 'CREATED', target: 'USERS', recipientCount: 2 });
    expect(order).toEqual(['persisted', 'delivered']);
    expect(delivery.deliver.mock.calls[0][0].map((i: any) => i.userId)).toEqual(['a', 'b']);
  });
});
