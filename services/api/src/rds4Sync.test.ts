import { describe, it, expect, beforeEach } from 'vitest';
import { syncFromRds4, Rds4SectionSnapshot } from './services/rds4Sync';
import { backendStore } from './store/backendStore';
import { INITIAL_SECTIONS } from './seedData';

describe('RDS4 Scheduled Sync Service', () => {
  beforeEach(() => {
    backendStore.resetState();
  });

  it('updates existing sections, adds new sections, and preserves stagedSectionIds', async () => {
    const preStaged = [...backendStore.getState().stagedSectionIds];
    const snapshots: Rds4SectionSnapshot[] = [
      ...INITIAL_SECTIONS.map((s) =>
        s.id === 'CSE327-01' ? { ...s, enrolled: 32 } : { ...s }
      ),
      {
        id: 'CSE499-01',
        courseCode: 'CSE 499',
        courseTitle: 'Senior Design I',
        department: 'ECE / CSE',
        credits: 3.0,
        sectionNumber: '01',
        faculty: 'Dr. Nova Ahmed',
        days: 'RA',
        timeSlot: '02:40 PM - 04:10 PM',
        room: 'LIB 602',
        capacity: 30,
        enrolled: 12,
        waitlisted: 0,
        prerequisites: ['CSE 327']
      }
    ];

    const res = await syncFromRds4(snapshots);
    expect(res.totalProcessed).toBe(10);
    expect(res.updatedSectionIds).toContain('CSE327-01');
    expect(res.addedSectionIds).toContain('CSE499-01');

    const nextState = backendStore.getState();
    expect(nextState.stagedSectionIds).toEqual(preStaged);
    expect(nextState.sections.find((s) => s.id === 'CSE327-01')?.enrolled).toBe(32);
    expect(nextState.sections.find((s) => s.id === 'CSE499-01')).toBeDefined();
    expect(nextState.auditLog[0].action).toBe('RDS4 Scheduled Sync');
  });

  it('clamps corrupted negative and over-capacity enrolled counts safely', async () => {
    const snapshots: Rds4SectionSnapshot[] = INITIAL_SECTIONS.map((s) => {
      if (s.id === 'CSE327-01') return { ...s, enrolled: 999, capacity: 40 };
      if (s.id === 'CSE327-02') return { ...s, enrolled: -12, capacity: 40 };
      return { ...s };
    });

    await syncFromRds4(snapshots);
    const state = backendStore.getState();
    expect(state.sections.find((s) => s.id === 'CSE327-01')?.enrolled).toBe(40);
    expect(state.sections.find((s) => s.id === 'CSE327-02')?.enrolled).toBe(0);
  });

  it('detects full -> open seat transition and notifies waitlisted students', async () => {
    // Student 2321450042 is waitlisted on CSE327-03 (40/40 initially)
    const snapshots: Rds4SectionSnapshot[] = INITIAL_SECTIONS.map((s) =>
      s.id === 'CSE327-03' ? { ...s, enrolled: 39, capacity: 40 } : { ...s }
    );

    const res = await syncFromRds4(snapshots);
    expect(res.reopenedSectionIds).toContain('CSE327-03');

    const state = backendStore.getState();
    const seatOpenNotifs = (state.notifications ?? []).filter(
      (n) => n.eventType === 'SEAT_OPEN' && n.sectionId === 'CSE327-03'
    );
    expect(seatOpenNotifs.length).toBeGreaterThan(0);
    expect(seatOpenNotifs.some((n) => n.studentId === '2321450042')).toBe(true);
  });

  it('serializes concurrent syncFromRds4 executions so SEAT_OPEN notifications are never duplicated', async () => {
    const reopenSnapshots: Rds4SectionSnapshot[] = INITIAL_SECTIONS.map((s) =>
      s.id === 'CSE327-03' ? { ...s, enrolled: 39, capacity: 40 } : { ...s }
    );
    const secondSnapshots: Rds4SectionSnapshot[] = INITIAL_SECTIONS.map((s) =>
      s.id === 'CSE327-03' ? { ...s, enrolled: 39, capacity: 40 } : s.id === 'CSE327-01' ? { ...s, enrolled: 30 } : { ...s }
    );

    await Promise.all([
      syncFromRds4(reopenSnapshots, { actor: 'Manual Admin' }),
      syncFromRds4(secondSnapshots, { actor: 'Cron Daemon' })
    ]);

    const state = backendStore.getState();
    const seatOpenNotifs = (state.notifications ?? []).filter(
      (n) => n.eventType === 'SEAT_OPEN' && n.sectionId === 'CSE327-03' && n.studentId === '2321450042'
    );
    // Only the first sync saw 40/40 -> 39/40; the serialized second sync saw 39/40 -> 39/40
    expect(seatOpenNotifs).toHaveLength(3); // 1 SMS + 1 PUSH + 1 IN_APP from the single transition
    expect(state.sections.find((s) => s.id === 'CSE327-01')?.enrolled).toBe(30);
  });
});
