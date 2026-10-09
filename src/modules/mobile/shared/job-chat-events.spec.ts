import { jobChatEvents } from './job-chat-events';

describe('persisted job timeline', () => {
  const thread = { status: 'completed', agreed_amount: '60.50', amount: '0.57',
    deal_confirmed_at: '2026-10-09T12:00:00Z', work_started_at: '2026-10-09T12:01:00Z',
    completed_at: '2026-10-09T12:02:08Z' };
  it('keeps agreement and final charge distinct and uses stable event IDs', () => {
    const events = jobChatEvents(thread, 'thread');
    expect(events.map(e => e.systemEvent)).toEqual(['deal_confirmed', 'work_started', 'work_completed']);
    expect(events[0].systemData.price).toBe(60.5);
    expect(events[2].systemData.price).toBe(.57);
    expect(events.every(e => e.type === 'system' && e.senderUserId === 'system')).toBe(true);
    expect(jobChatEvents(thread, 'thread')).toEqual(events);
  });
  it('does not invent timestamps or completion/payment events', () => {
    expect(jobChatEvents({ ...thread, status: 'assigned', work_started_at: null, deal_confirmed_at: null }, 'thread')).toEqual([]);
  });
  it('preserves the cancellation fact without implying completion', () => {
    const events = jobChatEvents({ ...thread, status: 'cancelled', updated_at: '2026-10-09T12:01:20Z' }, 'thread');
    expect(events.at(-1)?.content).toBe('Trabajo cancelado');
    expect(events.some(e => e.systemEvent === 'work_completed')).toBe(false);
  });
});
