/** Timeline facts come from persisted job timestamps, never from message text. */
export function jobChatEvents(thread: Record<string, any>, threadId: string) {
  const events: any[] = [];
  const add = (event: string, date: unknown, content: string, data = {}) => {
    if (!date) return;
    const timestamp = new Date(date as string);
    if (!Number.isFinite(timestamp.getTime())) return;
    events.push({ id: `${threadId}:event:${event}`, threadId, senderUserId: 'system',
      type: 'system', systemEvent: event, systemData: data, content,
      createdAt: timestamp.toISOString() });
  };
  add('deal_confirmed', thread.deal_confirmed_at, 'Trato confirmado',
    { price: Number(thread.agreed_amount ?? thread.amount ?? 0) });
  add('work_started', thread.work_started_at, 'Trabajo iniciado');
  if (thread.status === 'completed') {
    add('work_completed', thread.completed_at, 'Trabajo completado',
      { price: Number(thread.amount ?? 0) });
  } else if (thread.status === 'cancelled') {
    add('generic', thread.updated_at, 'Trabajo cancelado');
  }
  return events;
}
