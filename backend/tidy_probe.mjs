// Staging: 1) DRY look — would the mirror delete anything real? 2) the year rule on probe rows only.
import 'dotenv/config';
import prisma from './src/config/prisma.js';
import { quoConfig, getCall, getMessage } from './src/lib/quo.js';
import { forgetOld, mirrorQuoDeletions } from './src/lib/commsTidy.js';
let pass = 0, fail = 0;
const ok = (l, c, x) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${l}  ${x ?? ''}`); };
const cfg = await quoConfig();

// 1) dry: ask Quo about every stored row, delete nothing
const rows = await prisma.comms_events.findMany({ where: { vendor_id: cfg.vendorId }, select: { id: true, external_id: true, kind: true } });
let found = 0, missing = 0, errors = 0;
for (const r of rows) {
  try { (r.kind === 'call' ? await getCall(cfg.key, r.external_id) : await getMessage(cfg.key, r.external_id)) ? found++ : missing++; }
  catch { errors++; }
}
ok('dry run: Quo still has the stored calls & texts', found > 0 && missing <= 2, `${rows.length} stored · ${found} found · ${missing} not found in Quo · ${errors} errors`);

// 2) the year rule, on probe rows only
const old = new Date(); old.setMonth(old.getMonth() - 13);
const lead = await prisma.leads.findFirst({ where: { vendor_id: cfg.vendorId, NOT: { phone: null } }, select: { phone: true } });
const stranger = await prisma.comms_events.create({ data: { vendor_id: cfg.vendorId, external_id: 'PROBEOLD1' + Date.now(), kind: 'message', direction: 'incoming',
  from_number: '+16045559876', to_number: '+17787711112', body: 'old probe', occurred_at: old } });
const client = await prisma.comms_events.create({ data: { vendor_id: cfg.vendorId, external_id: 'PROBEOLD2' + Date.now(), kind: 'message', direction: 'incoming',
  from_number: lead.phone, to_number: '+17787711112', body: 'old probe from a lead', occurred_at: old } });
const recent = await prisma.comms_events.create({ data: { vendor_id: cfg.vendorId, external_id: 'PROBENEW' + Date.now(), kind: 'message', direction: 'incoming',
  from_number: '+16045559876', to_number: '+17787711112', body: 'recent probe', occurred_at: new Date() } });
const r = await forgetOld(cfg);
const still = async (e) => !!(await prisma.comms_events.findUnique({ where: { id: e.id } }));
ok('13-month-old text from a stranger → removed', !(await still(stranger)), JSON.stringify(r));
ok('13-month-old text from a LEAD → kept', await still(client));
ok('recent text → kept', await still(recent));

// 3) the mirror for real — ONLY if the dry run proved Quo answers for real rows; otherwise stop here
if (missing > 2 || errors > 0) { console.log('⛔ dry run did not prove Quo answers for every row — mirror NOT run'); await prisma.comms_events.deleteMany({ where: { external_id: { startsWith: 'PROBE' } } }); process.exit(0); }
const before = await prisma.comms_events.count({ where: { vendor_id: cfg.vendorId, NOT: { external_id: { startsWith: 'PROBE' } } } });
const m = await mirrorQuoDeletions(cfg);
const after = await prisma.comms_events.count({ where: { vendor_id: cfg.vendorId, NOT: { external_id: { startsWith: 'PROBE' } } } });
ok('mirror run: probe rows Quo never had → removed', !(await still(recent)) && !(await still(client)), JSON.stringify(m));
ok('mirror run: real calls & texts untouched', before === after, `${before} → ${after}`);

await prisma.comms_events.deleteMany({ where: { external_id: { startsWith: 'PROBE' } } });
console.log(`RESULT: ${pass} passed, ${fail} failed`);
await prisma.$disconnect();
