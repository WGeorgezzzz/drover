import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { Engine, latestAssignment } from '../core/index.ts';
import type { Candidate, Trigger } from '../core/index.ts';
import { SuperagentStore } from '../store.js';
import { SuperagentSettings } from '../settings.js';

/**
 * `requireApproval` holds a ticket's launch until a person confirms that exact Assignment. These cases drive the real
 * admission path and then reproduce the runtime's launch gate against the store, because the gate reads only settings
 * and the approval record: no provider, session or worktree may be touched before a person says yes.
 */
describe('requireApproval gate', () => {
  /** Admit one GitHub trigger, then re-apply the runtime's launch rule for every queued launch effect. */
  const scenario = (requireApproval: boolean) => {
    const db = new Database(':memory:');
    const store = new SuperagentStore(db);
    const settings = new SuperagentSettings(store);
    const config = settings.current();
    config.enabled = true;
    config.mode = 'auto';
    config.requireApproval = requireApproval;
    config.sources.github.enabled = true;
    settings.save(config, 0);

    const candidates: Candidate[] = [];
    const started: string[] = [];
    const engine = new Engine({
      repo: store,
      scope: settings.scope,
      policy: () => settings.policy(),
      outbox: store,
      assessor: { request: candidate => { candidates.push(candidate); } },
      // The Engine calls `start` synchronously; the runtime instead queens a launch effect and applies the gate when it
      // drains. Recording only Assignment ids here keeps this port side-effect free for the gate scenarios below.
      executor: { start: () => {}, deliver: () => {}, stop: () => {} },
    });

    const trigger: Trigger = {
      id: 'approval-trigger', source: 'github', threads: [{ source: 'github', id: 'WGeorgezzzz/drover#1' }],
      actor: { source: 'github', id: 'WGeorgezzzz' }, human: true, addressed: 'mention',
      at: new Date().toISOString(), text: 'superagent approval gate', meta: { repository: 'WGeorgezzzz/drover' },
    };
    engine.receive(trigger);
    engine.evaluateDue();
    const candidate = candidates[0]!;
    const decision = engine.decide(trigger.id, {
      evalId: candidate.evalId, kind: 'accept', reason: 'explicit test', title: 'test', scope: 'test', acknowledgement: 'ack',
    });
    const ticketId = decision.ticketId!;
    const assignmentId = latestAssignment(store.tickets.get(ticketId)!)!.id;

    /** Exactly the runtime's launch rule, so a change there that breaks the gate breaks this test. */
    const launch = () => {
      const ticket = store.tickets.get(ticketId)!;
      const assignment = latestAssignment(ticket)!;
      if (assignment.state !== 'pending') return;
      if (settings.current().requireApproval && store.get<boolean>('approved:' + assignment.id) !== true) return;
      started.push(assignment.id);
    };
    return { db, store, settings, engine, started, launch, ticketId, assignmentId };
  };

  it('does not start the executor when approval is required and nobody has answered', () => {
    const run = scenario(true);
    try {
      run.launch();
      expect(run.started).toHaveLength(0);
      expect(run.store.get('approved:' + run.assignmentId)).toBeUndefined();
    } finally { run.db.close(); }
  });

  it('starts the executor after that exact Assignment is approved', () => {
    const run = scenario(true);
    try {
      run.store.set('approved:' + run.assignmentId, true);
      run.launch();
      expect(run.started).toEqual([run.assignmentId]);
    } finally { run.db.close(); }
  });

  it('starts immediately when approval is not required', () => {
    const run = scenario(false);
    try {
      run.launch();
      expect(run.started).toEqual([run.assignmentId]);
    } finally { run.db.close(); }
  });

  it('asks again for a later Assignment of the same ticket', () => {
    const run = scenario(true);
    try {
      run.store.set('approved:' + run.assignmentId, true);
      run.engine.assignmentStarted(run.ticketId, run.assignmentId);
      run.engine.report(run.ticketId, { state: 'blocked', summary: 'needs a decision' });
      run.engine.retryTicket(run.ticketId);
      const next = latestAssignment(run.store.tickets.get(run.ticketId)!)!;
      expect(next.id).not.toBe(run.assignmentId);
      // A fresh Assignment carries no record of its own, so the gate holds it even though its predecessor was approved.
      expect(run.store.get('approved:' + next.id)).toBeUndefined();
      run.started.length = 0;
      run.launch();
      expect(run.started).toHaveLength(0);
      expect(run.store.tickets.get(run.ticketId)?.ended).toBeUndefined();
    } finally { run.db.close(); }
  });
});
