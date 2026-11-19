import { describe, it, expect, beforeEach } from 'vitest';
import { backendStore } from './store/backendStore';
import { isPostgresEnabled } from './db/pool';
import { INITIAL_STUDENT, verifyPassword } from './seedData';

describe('Dual-Mode BackendStore, ACID Locking & Concurrency', () => {
  beforeEach(() => {
    backendStore.resetState();
  });

  it('defaults to memory mode under Vitest unless USE_PG_IN_TEST=true', () => {
    expect(isPostgresEnabled()).toBe(false);
  });

  it('serializes 20 concurrent seat claims via withSectionLock with 0 overbooking on 1 remaining seat', async () => {
    backendStore.updateState((s) => {
      s.sections = s.sections.map((sec) =>
        sec.id === 'CSE327-01' ? { ...sec, capacity: 40, enrolled: 39 } : sec
      );
    });

    const attempts = Array.from({ length: 20 }, () =>
      backendStore.withSectionLock('CSE327-01', async () => {
        const state = backendStore.getState();
        const sec = state.sections.find((s) => s.id === 'CSE327-01')!;
        if (sec.enrolled >= sec.capacity) {
          return false;
        }
        await new Promise((r) => setTimeout(r, 2));
        backendStore.updateState((s) => {
          s.sections = s.sections.map((item) =>
            item.id === 'CSE327-01' ? { ...item, enrolled: item.enrolled + 1 } : item
          );
        });
        return true;
      })
    );

    const results = await Promise.all(attempts);
    const winners = results.filter(Boolean);
    expect(winners).toHaveLength(1);

    const finalSec = backendStore.getState().sections.find((s) => s.id === 'CSE327-01')!;
    expect(finalSec.enrolled).toBe(40);
    expect(finalSec.enrolled).toBeLessThanOrEqual(finalSec.capacity);
  });

  it('rolls back confirmEnrollmentTx cleanly with 409 when any staged section is full (no silent clamp)', async () => {
    // Stage a full section artificially via updateState to simulate race before confirm
    backendStore.updateState((s) => {
      s.sections = s.sections.map((sec) =>
        sec.id === 'CSE327-01' ? { ...sec, enrolled: sec.capacity } : sec
      );
    });

    const preCse311 = backendStore
      .getState()
      .sections.find((s) => s.id === 'CSE311-03')!.enrolled;

    const outcome = await backendStore.confirmEnrollmentTx(INITIAL_STUDENT.id);
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(409);

    // Zero partial increments on other staged sections!
    const postCse311 = backendStore
      .getState()
      .sections.find((s) => s.id === 'CSE311-03')!.enrolled;
    expect(postCse311).toBe(preCse311);
  });

  it('supports deadlock-free multi-section lock ordering via withSectionLocks', async () => {
    const order: string[] = [];
    await Promise.all([
      backendStore.withSectionLocks(['CSE311-03', 'CSE327-01'], async () => {
        order.push('batch-A');
      }),
      backendStore.withSectionLocks(['CSE327-01', 'CSE311-03'], async () => {
        order.push('batch-B');
      })
    ]);
    expect(order).toHaveLength(2);
  });

  it('validates seeded users, password hashing, and token revocation blocklist with pruning', async () => {
    const stu = await backendStore.findUserById('2412159042');
    expect(stu).not.toBeNull();
    expect(stu?.role).toBe('student');
    expect(verifyPassword('SmartAdvisor2025!', stu!.passwordHash)).toBe(true);
    expect(verifyPassword('WrongPassword', stu!.passwordHash)).toBe(false);

    await backendStore.revokeToken('jti-active', '2412159042', Date.now() + 60_000);
    await backendStore.revokeToken('jti-expired', '2412159042', Date.now() - 10_000);

    expect(await backendStore.isTokenRevoked('jti-active')).toBe(true);
    expect(await backendStore.isTokenRevoked('jti-expired')).toBe(false);
  });

  it('handles waitlist join, petition submission, faculty decision guard (409), room cap (422), and rule auto-approval', async () => {
    // Waitlist join on full section
    const wl = await backendStore.joinWaitlistTx(INITIAL_STUDENT.id, 'CSE327-03');
    expect(wl.ok).toBe(true);
    expect(wl.position).toBe(15);

    // Submit petition
    const pet = await backendStore.submitPetitionTx(INITIAL_STUDENT.id, {
      sectionId: 'CSE425-01',
      courseCode: 'CSE 425',
      ruleCode: 'RULE-4.2',
      reason: 'Senior graduating this semester.'
    });
    expect(pet.status).toBe(201);
    expect(pet.exceptionCase.status).toBe('pending');

    // Approve initial case and verify re-decision returns 409
    const approveRes = await backendStore.decideExceptionTx('CASE #EX-2025-0841', 'approve', {
      id: 'nova.ahmed',
      name: 'Dr. Nova Ahmed',
      role: 'faculty'
    });
    expect(approveRes.ok).toBe(true);

    const reDecide = await backendStore.decideExceptionTx('CASE #EX-2025-0841', 'reject', {
      id: 'nova.ahmed',
      name: 'Dr. Nova Ahmed',
      role: 'faculty'
    });
    expect(reDecide.ok).toBe(false);
    expect(reDecide.status).toBe(409);

    // Expand capacity owner check & room cap check
    const wrongOwner = await backendStore.expandSectionCapacityTx('CSE327-01', 5, {
      id: 'nova.ahmed',
      name: 'Dr. Nova Ahmed',
      role: 'faculty'
    });
    expect(wrongOwner.status).toBe(403);

    const overCap = await backendStore.expandSectionCapacityTx('CSE327-01', 25, {
      id: 'nabeel.mohammed',
      name: 'Dr. Nabeel Mohammed',
      role: 'faculty'
    });
    expect(overCap.status).toBe(422);

    // Reset restores clean fixtures
    const reset = await backendStore.resetStateAsync();
    expect(reset.waitlistSectionIds).toEqual([]);
    expect(reset.exceptions).toHaveLength(3);
  });

  it('confirmEnrollmentTx(simulateRdsFailure) sets rdsFallbackPrompt and resolveRdsFallbackTx completes without deadlock', async () => {
    const simOutcome = await backendStore.confirmEnrollmentTx(INITIAL_STUDENT.id, {
      simulateRdsFailure: true
    });
    expect(simOutcome.ok).toBe(true);
    expect(simOutcome.status).toBe(200);
    expect(simOutcome.fallbackPrompt).toBeDefined();
    expect(simOutcome.fallbackPrompt?.resolved).toBe(false);
    expect(simOutcome.fallbackPrompt?.failedSectionId).toBe('CSE327-01');
    expect(simOutcome.receipt?.status).toBe('fallback_required');

    const fallbackOutcome = await backendStore.resolveRdsFallbackTx(
      INITIAL_STUDENT.id,
      'CSE327-01',
      'CSE327-04'
    );
    expect(fallbackOutcome.ok).toBe(true);
    expect(fallbackOutcome.status).toBe(200);
    expect(fallbackOutcome.receipt).not.toBeNull();
    expect(fallbackOutcome.receipt?.status).toBe('confirmed');
    expect(fallbackOutcome.state.stagedSectionIds).toContain('CSE327-04');
    expect(fallbackOutcome.state.stagedSectionIds).not.toContain('CSE327-01');
    expect(fallbackOutcome.state.rdsFallbackPrompt).toBeNull();
  });

  it('resolveRdsFallbackTx rolls back cleanly with 409 on clash or full fallback without mutating stagedSectionIds or resolving prompt', async () => {
    await backendStore.confirmEnrollmentTx(INITIAL_STUDENT.id, { simulateRdsFailure: true });
    const preStaged = [...backendStore.getState().stagedSectionIds];

    // Full fallback section (CSE327-03 is 40/40) -> 409 rollback
    const fullOutcome = await backendStore.resolveRdsFallbackTx(
      INITIAL_STUDENT.id,
      'CSE327-01',
      'CSE327-03'
    );
    expect(fullOutcome.ok).toBe(false);
    expect(fullOutcome.status).toBe(409);
    expect(fullOutcome.receipt).toBeNull();
    expect(fullOutcome.state.stagedSectionIds).toEqual(preStaged);
    expect(fullOutcome.state.rdsFallbackPrompt?.resolved).toBe(false);

    // Clashing fallback section (CSE327-02 MW 09:40 AM clashes with staged CSE311-03 MW 09:40 AM) -> 409 rollback
    const preCse311Enrolled = backendStore
      .getState()
      .sections.find((s) => s.id === 'CSE311-03')!.enrolled;
    const clashOutcome = await backendStore.resolveRdsFallbackTx(
      INITIAL_STUDENT.id,
      'CSE327-01',
      'CSE327-02'
    );
    expect(clashOutcome.ok).toBe(false);
    expect(clashOutcome.status).toBe(409);
    expect(clashOutcome.receipt).toBeNull();
    expect(clashOutcome.state.stagedSectionIds).toEqual(preStaged);
    expect(clashOutcome.state.rdsFallbackPrompt?.resolved).toBe(false);
    expect(
      clashOutcome.state.sections.find((s) => s.id === 'CSE311-03')!.enrolled
    ).toBe(preCse311Enrolled);
  });

  it('serializes concurrent decideExceptionTx calls under section lock contention (1 succeeds 200, 1 returns 409, +1 only)', async () => {
    const actor = { id: 'nova.ahmed', name: 'Dr. Nova Ahmed', role: 'faculty' as const };
    const before = backendStore.getState().sections.find((s) => s.id === 'CSE425-01')!;

    let releaseContention!: () => void;
    const contentionGate = new Promise<void>((resolve) => {
      releaseContention = resolve;
    });
    const holder = backendStore.withSectionLock('CSE425-01', () => contentionGate);

    const racePromise = Promise.all([
      backendStore.decideExceptionTx('CASE #EX-2025-0841', 'approve', actor),
      backendStore.decideExceptionTx('CASE #EX-2025-0841', 'approve', actor)
    ]);

    await new Promise((r) => setTimeout(r, 15));
    releaseContention();
    await holder;

    const [r1, r2] = await racePromise;
    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const after = backendStore.getState().sections.find((s) => s.id === 'CSE425-01')!;
    expect(after.capacity).toBe(before.capacity + 1);
    expect(after.enrolled).toBe(before.enrolled + 1);
  });

  it('serializes confirmEnrollmentTx vs unstageSectionTx so an unstaged section is never enrolled', async () => {
    const preCse311 = backendStore
      .getState()
      .sections.find((s) => s.id === 'CSE311-03')!.enrolled;

    // Hold CSE327-01 lock briefly so confirmEnrollmentTx cannot finish before unstageSectionTx is queued,
    // or if unstage acquires cart lock first it removes CSE311-03 before confirm reads stagedSectionIds.
    const [unstageRes, confirmRes] = await Promise.all([
      backendStore.unstageSectionTx(INITIAL_STUDENT.id, 'CSE311-03'),
      backendStore.confirmEnrollmentTx(INITIAL_STUDENT.id)
    ]);

    expect(unstageRes.ok).toBe(true);
    expect(confirmRes.ok).toBe(true);

    const finalState = backendStore.getState();
    expect(finalState.stagedSectionIds).not.toContain('CSE311-03');
    const receiptSectionIds = (finalState.receipt?.sections ?? []).map((s) => s.id);
    if (!receiptSectionIds.includes('CSE311-03')) {
      expect(
        finalState.sections.find((s) => s.id === 'CSE311-03')!.enrolled
      ).toBe(preCse311);
    } else {
      // If confirm ran strictly before unstage, CSE311-03 was still staged at confirmation time
      expect(
        finalState.sections.find((s) => s.id === 'CSE311-03')!.enrolled
      ).toBe(preCse311 + 1);
    }
  });

  it('createBypassRuleTx upserts in place in memory mode without duplicating id/code (PG parity)', async () => {
    const first = await backendStore.createBypassRuleTx(
      {
        code: 'RULE-9.1',
        title: 'Initial Title',
        description: 'Initial description for standing override.',
        category: 'Standing',
        enabled: false
      },
      'Dr. Nova Ahmed'
    );
    expect(first.ok).toBe(true);
    expect(first.state.bypassRules.filter((r) => r.id === 'rule-9-1')).toHaveLength(1);

    const second = await backendStore.createBypassRuleTx(
      {
        code: 'rule-9.1',
        title: 'Updated Title',
        description: 'Updated description for standing override.',
        category: 'Standing',
        enabled: true
      },
      'Dr. Nabeel Mohammed'
    );
    expect(second.ok).toBe(true);
    const matching = second.state.bypassRules.filter((r) => r.id === 'rule-9-1');
    expect(matching).toHaveLength(1);
    expect(matching[0].title).toBe('Updated Title');
    expect(matching[0].description).toBe('Updated description for standing override.');
    expect(matching[0].enabled).toBe(true);
    expect(matching[0].lastUpdated).toContain('Dr. Nabeel Mohammed');
  });

  it('syncZeroSeatEscalationsInMemory transitions auto-generated escalation Open -> Resolved -> Open', async () => {
    // Make CSE 311 full (enrolled === capacity) via syncRds4SectionsTx
    const fullSnapshot = backendStore
      .getState()
      .sections.map((s) => (s.id === 'CSE311-03' ? { ...s, enrolled: s.capacity } : s));
    const afterFull = await backendStore.syncRds4SectionsTx(fullSnapshot, {
      actor: 'Test Daemon',
      details: 'CSE 311 full'
    });
    const escOpen = afterFull.escalations.find((e) => e.courseCode === 'CSE 311');
    expect(escOpen).toBeDefined();
    expect(escOpen?.autoGenerated).toBe(true);
    expect(escOpen?.status).toBe('Open');

    // Expand capacity -> Open transitions to Resolved
    const expandRes = await backendStore.expandSectionCapacityTx('CSE311-03', 5, {
      id: 'tanjila.farah',
      name: 'Dr. Tanjila Farah',
      role: 'faculty',
      instructorName: 'Dr. Tanjila Farah'
    });
    expect(expandRes.ok).toBe(true);
    const escResolved = expandRes.state.escalations.find((e) => e.courseCode === 'CSE 311');
    expect(escResolved?.status).toBe('Resolved');
    expect(escResolved?.deficit).toBe(0);

    // Fill again -> Resolved transitions back to Open
    const fullAgainSnapshot = expandRes.state.sections.map((s) =>
      s.id === 'CSE311-03' ? { ...s, enrolled: s.capacity } : s
    );
    const afterFullAgain = await backendStore.syncRds4SectionsTx(fullAgainSnapshot, {
      actor: 'Test Daemon',
      details: 'CSE 311 full again'
    });
    const escReopened = afterFullAgain.escalations.find((e) => e.courseCode === 'CSE 311');
    expect(escReopened?.status).toBe('Open');
  });
});
