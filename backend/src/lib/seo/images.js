/**
 * 🖼️ Screenshots of the real app on the marketing pages (2026-10-31). Taken from a demo studio on staging —
 * "Lumière Studio", a fictional business with fictional couples (…@example.com, 555 numbers) — never from a real
 * vendor's account. Files: frontend/public/shots/. Alt text is written for people and for Google Images.
 */
import fs from 'node:fs';
let SIZES = {};
try { SIZES = JSON.parse(fs.readFileSync(new URL('./image-sizes.json', import.meta.url), 'utf8')); } catch { /* sizes are optional */ }
const img = (name, alt) => ({ src: `/shots/${name}.jpg`, alt, phone: name.startsWith('phone-'), w: SIZES[name]?.[0], h: SIZES[name]?.[1] });

const LEADS = img('leads-list', 'iwopo leads list: every wedding inquiry with its received time, event date, venue and status');
const LEAD = img('lead-detail', 'A lead in iwopo: contact details, event details, chosen package, deposit and payments');
const FORM = img('phone-inquiry-form', 'A wedding inquiry form on a phone, built with iwopo');
const PORTAL = img('phone-portal-packages', 'The client portal on a phone: the couple chooses their wedding package');
const CONTRACT = img('phone-portal-contract', 'A wedding contract ready to initial and sign on a phone');
const SCHEDULE = img('phone-contract-schedule', 'Contract schedule filled in automatically: date, times, hours, venue, guests and getting-ready locations');
const EDITOR = img('contract-editor', 'Editing a wedding photography contract template in iwopo, section by section');
const CAL = img('calendar', 'Booking calendar with confirmed weddings for the month');
const PHONE_LEADS = img('phone-leads', 'Wedding leads as cards on a phone');

export const IMAGES = {
  '/features': [LEADS],
  '/features/leads': [LEADS, FORM, PORTAL],
  '/features/contracts': [SCHEDULE, EDITOR, CONTRACT],
  '/features/calendar': [CAL],
  '/pricing': [LEAD],
  '/for/wedding-photographers': [PORTAL, LEADS, SCHEDULE],
  '/for/wedding-videographers': [SCHEDULE, CAL],
  '/for/photo-and-video-studios': [CAL, LEADS],
  '/for/south-asian-weddings': [SCHEDULE, FORM],
  '/compare/honeybook-alternative': [LEADS, PORTAL],
  '/guides/wedding-photography-contract': [SCHEDULE],
  '/guides/wedding-photography-inquiry-form': [FORM],
  '/it': [LEADS, PORTAL], '/de': [LEADS, PORTAL], '/es': [LEADS, PORTAL], '/fr': [LEADS, PORTAL],
  '*': [PHONE_LEADS],
};
