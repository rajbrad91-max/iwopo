import { useState } from 'react';
import { ContactStrip, MainEventCard, PreEventCards, NotesCard } from './LeadCards';
import PreEvents from './PreEvents';
import { leadOverview } from '../lib/leadOverview';

/**
 * 🗂️ A lead as the lead page and the booking page both show it (Raj, 2026-11-05): the contact strip, and the main
 * event, pre-events and notes cards. ＋ Add on the Pre-events card opens the pre-event editor in place; `onSaved`
 * hears about a saved change. `cfg` is the vendor's inquiry-form settings (which questions the lead was asked).
 * `onEdit` (the lead page) puts ✏️ Edit Details on the main event card, which then always shows, so it can be reached.
 */
export function LeadContact({ lead, cfg }) {
  const o = leadOverview(lead, cfg);
  return <ContactStrip name={lead.name} role={lead.role} answers={o.contactAnswers} items={o.contactItems} meta={o.contactMeta} />;
}

export function LeadEvents({ lead, cfg, onSaved, onEdit }) {
  const o = leadOverview(lead, cfg);
  const [editingPre, setEditingPre] = useState(false);
  return (
    <>
      {(o.showMainCard || onEdit) && <MainEventCard ev={o.mainEvent} details={o.eventDetails} onEdit={onEdit} />}
      {editingPre
        ? <PreEvents key={`${lead.id}:${lead.updated_at}`} lead={lead} onSaved={onSaved} onDone={() => setEditingPre(false)} />
        : <PreEventCards preEvents={lead.pre_events} onAdd={() => setEditingPre(true)} />}
      <NotesCard notes={String(lead.notes || '').trim()} />
    </>
  );
}
