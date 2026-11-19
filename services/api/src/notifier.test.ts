import { describe, it, expect, vi } from 'vitest';
import { NotifierService, NotificationTransport } from './services/notifier';
import { INITIAL_EXCEPTIONS, INITIAL_SECTIONS } from './seedData';

describe('NotifierService & SeatTracker Observer Pattern', () => {
  it('dispatches SMS, PUSH, and IN_APP notifications when a seat opens', async () => {
    const smsMock = vi.fn();
    const pushMock = vi.fn();
    const transport: NotificationTransport = {
      sendSms: smsMock,
      sendPush: pushMock
    };

    const notifier = new NotifierService(transport);
    const sec = { ...INITIAL_SECTIONS[2], enrolled: 39, capacity: 40 };
    const items = await notifier.notifySeatOpened(sec, ['2412159042', '2321450042']);

    expect(items).toHaveLength(6); // 2 students * 3 channels
    expect(smsMock).toHaveBeenCalledTimes(2);
    expect(pushMock).toHaveBeenCalledTimes(2);
    expect(items.every((i) => i.status === 'sent' && i.eventType === 'SEAT_OPEN')).toBe(true);
    expect(notifier.getDeliveryLogs('2412159042')).toHaveLength(3);
  });

  it('dispatches PETITION_DECIDED notifications for approved, rejected, and flagged decisions', async () => {
    const notifier = new NotifierService();
    const approvedCase = { ...INITIAL_EXCEPTIONS[0], status: 'approved' as const };
    const rejectedCase = { ...INITIAL_EXCEPTIONS[1], status: 'rejected' as const };
    const flaggedCase = { ...INITIAL_EXCEPTIONS[2], status: 'flagged' as const };

    const a = await notifier.notifyPetitionDecision(approvedCase);
    const r = await notifier.notifyPetitionDecision(rejectedCase);
    const f = await notifier.notifyPetitionDecision(flaggedCase);

    expect(a[0].eventType).toBe('PETITION_DECIDED');
    expect(a[0].title).toContain('APPROVED');
    expect(r[0].title).toContain('REJECTED');
    expect(f[0].title).toContain('FLAGGED');
  });

  it('isolates SMS/Push gateway failures without throwing or rejecting caller transactions', async () => {
    const failingTransport: NotificationTransport = {
      sendSms: () => {
        throw new Error('SMS gateway timeout');
      },
      sendPush: async () => {
        throw new Error('FCM unavailable');
      }
    };

    const notifier = new NotifierService(failingTransport);
    const sec = { ...INITIAL_SECTIONS[0], enrolled: 35, capacity: 40 };

    await expect(notifier.notifySeatOpened(sec, ['2412159042'])).resolves.toBeDefined();

    const logs = notifier.getDeliveryLogs('2412159042');
    const smsLog = logs.find((l) => l.channel === 'SMS');
    const pushLog = logs.find((l) => l.channel === 'PUSH');
    const inAppLog = logs.find((l) => l.channel === 'IN_APP');

    expect(smsLog?.status).toBe('failed');
    expect(smsLog?.error).toContain('SMS gateway timeout');
    expect(pushLog?.status).toBe('failed');
    expect(pushLog?.error).toContain('FCM unavailable');
    expect(inAppLog?.status).toBe('sent');
  });

  it('supports unsubscribe on SeatTracker to stop further notifications', async () => {
    const notifier = new NotifierService();
    const customMock = vi.fn().mockResolvedValue([]);
    const unsub = notifier.seatTracker.subscribe({
      id: 'custom-test-observer',
      onEvent: customMock
    });

    await notifier.notifyWaitlistJoined('2412159042', INITIAL_SECTIONS[2], 15);
    expect(customMock).toHaveBeenCalledTimes(1);

    unsub();
    await notifier.notifyWaitlistJoined('2412159042', INITIAL_SECTIONS[2], 16);
    expect(customMock).toHaveBeenCalledTimes(1);
  });
});
