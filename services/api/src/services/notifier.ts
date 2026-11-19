import crypto from 'crypto';
import {
  CourseSection,
  ExceptionCase,
  NotificationChannel,
  NotificationEventType,
  NotificationItem
} from '../types';

export type SeatTrackerEvent =
  | {
      type: 'SEAT_OPEN';
      studentId: string;
      sectionId: string;
      courseCode: string;
      sectionNumber: string;
      availableSeats: number;
    }
  | {
      type: 'PETITION_DECIDED';
      studentId: string;
      caseId: string;
      courseCode: string;
      decision: 'approved' | 'rejected' | 'flagged';
    }
  | {
      type: 'WAITLIST_ALERT';
      studentId: string;
      sectionId: string;
      courseCode: string;
      position?: number;
    }
  | {
      type: 'RDS_FALLBACK';
      studentId: string;
      failedSectionId: string;
      failedCourseCode: string;
      alternativesCount: number;
    }
  | {
      type: 'ENROLLMENT_CONFIRMED';
      studentId: string;
      transactionId: string;
      totalCredits: number;
    };

export interface NotificationTransport {
  sendSms(studentId: string, message: string): Promise<void> | void;
  sendPush(studentId: string, title: string, message: string): Promise<void> | void;
}

export interface NotificationObserver {
  readonly id: string;
  onEvent(event: SeatTrackerEvent): Promise<NotificationItem[]>;
}

class DefaultNotificationTransport implements NotificationTransport {
  public sendSms(_studentId: string, _message: string): void {
    // In-process SMS gateway simulation; overridden by webhook/provider in production
  }

  public sendPush(_studentId: string, _title: string, _message: string): void {
    // In-process Push gateway simulation; overridden by FCM/APNs in production
  }
}

export class SeatTracker {
  private observers: Set<NotificationObserver> = new Set();

  public subscribe(observer: NotificationObserver): () => void {
    this.observers.add(observer);
    return () => {
      this.unsubscribe(observer);
    };
  }

  public unsubscribe(observer: NotificationObserver): void {
    this.observers.delete(observer);
  }

  public getObserverCount(): number {
    return this.observers.size;
  }

  /**
   * Notifies all subscribed observers with strict fault isolation.
   * Never throws or rejects on observer/transport error so DB commits never roll back.
   */
  public async notify(event: SeatTrackerEvent): Promise<NotificationItem[]> {
    const items: NotificationItem[] = [];
    for (const observer of this.observers) {
      try {
        const produced = await observer.onEvent(event);
        items.push(...produced);
      } catch (err) {
        console.error(`[SeatTracker] Observer ${observer.id} failed cleanly:`, err);
      }
    }
    return items;
  }
}

function buildMessageForEvent(event: SeatTrackerEvent): {
  title: string;
  message: string;
  sectionId?: string;
  courseCode?: string;
} {
  switch (event.type) {
    case 'SEAT_OPEN':
      return {
        title: `Seat Opened: ${event.courseCode} Sec ${event.sectionNumber}`,
        message: `${event.availableSeats} seat(s) opened in ${event.courseCode} Sec ${event.sectionNumber}. Stage now before capacity fills.`,
        sectionId: event.sectionId,
        courseCode: event.courseCode
      };
    case 'PETITION_DECIDED':
      return {
        title: `Petition ${event.decision.toUpperCase()}: ${event.courseCode}`,
        message: `Your exception petition ${event.caseId} for ${event.courseCode} was ${event.decision}.`,
        courseCode: event.courseCode
      };
    case 'WAITLIST_ALERT':
      return {
        title: `Waitlist Joined: ${event.courseCode}`,
        message: `You are queued at position #${event.position ?? 1} for ${event.courseCode} (${event.sectionId}).`,
        sectionId: event.sectionId,
        courseCode: event.courseCode
      };
    case 'RDS_FALLBACK':
      return {
        title: `RDS Fallback Ready: ${event.failedCourseCode}`,
        message: `RDS push failed for ${event.failedSectionId}. ${event.alternativesCount} DAG-compliant alternative(s) are ready for 1-click switch.`,
        sectionId: event.failedSectionId,
        courseCode: event.failedCourseCode
      };
    case 'ENROLLMENT_CONFIRMED':
      return {
        title: `Enrollment Confirmed (${event.transactionId})`,
        message: `Schedule locked for ${event.totalCredits.toFixed(1)} credits. Receipt ${event.transactionId} issued.`
      };
  }
}

export class NotifierService {
  public readonly seatTracker: SeatTracker;
  private transport: NotificationTransport;
  private deliveryLogs: NotificationItem[] = [];
  private onLogRecorded: ((item: NotificationItem) => void) | null = null;
  private defaultUnsubscribes: Array<() => void> = [];

  constructor(transport?: NotificationTransport) {
    this.seatTracker = new SeatTracker();
    this.transport = transport ?? new DefaultNotificationTransport();
    this.attachDefaultObservers();
  }

  private attachDefaultObservers(): void {
    const channels: NotificationChannel[] = ['SMS', 'PUSH', 'IN_APP'];
    for (const channel of channels) {
      const observer: NotificationObserver = {
        id: `observer-${channel.toLowerCase()}`,
        onEvent: async (event) => {
          const item = await this.dispatchChannel(channel, event);
          return [item];
        }
      };
      this.defaultUnsubscribes.push(this.seatTracker.subscribe(observer));
    }
  }

  public setTransport(transport: NotificationTransport): void {
    this.transport = transport;
  }

  public setOnLogRecorded(cb: ((item: NotificationItem) => void) | null): void {
    this.onLogRecorded = cb;
  }

  private recordItem(item: NotificationItem): void {
    this.deliveryLogs.unshift(item);
    if (this.deliveryLogs.length > 500) {
      this.deliveryLogs = this.deliveryLogs.slice(0, 500);
    }
    if (this.onLogRecorded) {
      try {
        this.onLogRecorded(item);
      } catch (err) {
        console.error('[NotifierService] onLogRecorded callback error:', err);
      }
    }
  }

  private async dispatchChannel(
    channel: NotificationChannel,
    event: SeatTrackerEvent
  ): Promise<NotificationItem> {
    const { title, message, sectionId, courseCode } = buildMessageForEvent(event);
    const id = `notif-${crypto.randomUUID().slice(0, 8)}`;
    const createdAt = new Date().toISOString();

    let status: 'sent' | 'failed' = 'sent';
    let error: string | undefined;

    try {
      if (channel === 'SMS') {
        await this.transport.sendSms(event.studentId, message);
      } else if (channel === 'PUSH') {
        await this.transport.sendPush(event.studentId, title, message);
      }
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : 'Notification transport error';
    }

    const item: NotificationItem = {
      id,
      studentId: event.studentId,
      sectionId,
      courseCode,
      channel,
      eventType: event.type as NotificationEventType,
      title,
      message,
      status,
      error,
      createdAt,
      read: false
    };

    this.recordItem(item);
    return item;
  }

  public async notifySeatOpened(
    section: CourseSection,
    waitlistedStudentIds: string[]
  ): Promise<NotificationItem[]> {
    const availableSeats = Math.max(0, section.capacity - section.enrolled);
    const allItems: NotificationItem[] = [];
    for (const studentId of waitlistedStudentIds) {
      const produced = await this.seatTracker.notify({
        type: 'SEAT_OPEN',
        studentId,
        sectionId: section.id,
        courseCode: section.courseCode,
        sectionNumber: section.sectionNumber,
        availableSeats
      });
      allItems.push(...produced);
    }
    return allItems;
  }

  public async notifyPetitionDecision(exceptionCase: ExceptionCase): Promise<NotificationItem[]> {
    if (exceptionCase.status === 'pending') {
      return [];
    }
    return this.seatTracker.notify({
      type: 'PETITION_DECIDED',
      studentId: exceptionCase.studentId,
      caseId: exceptionCase.id,
      courseCode: exceptionCase.courseCode,
      decision: exceptionCase.status
    });
  }

  public async notifyWaitlistJoined(
    studentId: string,
    section: CourseSection,
    position: number
  ): Promise<NotificationItem[]> {
    return this.seatTracker.notify({
      type: 'WAITLIST_ALERT',
      studentId,
      sectionId: section.id,
      courseCode: section.courseCode,
      position
    });
  }

  public async notifyRdsFallback(
    studentId: string,
    failedSectionId: string,
    failedCourseCode: string,
    alternativesCount: number
  ): Promise<NotificationItem[]> {
    return this.seatTracker.notify({
      type: 'RDS_FALLBACK',
      studentId,
      failedSectionId,
      failedCourseCode,
      alternativesCount
    });
  }

  public async notifyEnrollmentConfirmed(
    studentId: string,
    transactionId: string,
    totalCredits: number
  ): Promise<NotificationItem[]> {
    return this.seatTracker.notify({
      type: 'ENROLLMENT_CONFIRMED',
      studentId,
      transactionId,
      totalCredits
    });
  }

  public getDeliveryLogs(studentId?: string): NotificationItem[] {
    if (!studentId) {
      return [...this.deliveryLogs];
    }
    return this.deliveryLogs.filter((item) => item.studentId === studentId);
  }

  public clearDeliveryLogs(): void {
    this.deliveryLogs = [];
  }
}

export const notifierService = new NotifierService();
