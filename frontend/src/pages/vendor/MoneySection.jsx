/**
 * 💰 The money part of a lead or booking: invoices, payments and their status.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { useDialog } from '../../lib/dialog.jsx';
import { api, fmtDateTime, fmtMoney, moneySymbol } from '../../lib/api';
import { STATUSES, S_ICON, S_LABEL } from './statuses';

export function MoneySection({ lead, refresh = 0 }) {   // refresh: bumped when packages are loaded, saved or sent
  const [hidePay, setHidePay] = useState(false);   // 🔒 the vendor's payment-privacy setting
  const [reveal, setReveal] = useState(false);     // 👁 shown for this visit only
  useEffect(() => { api.mySettings().then(s => setHidePay(!!s?.settings?.hide_payments)).catch(() => {}); }, []);
  const masked = hidePay && !reveal;
  const dialog = useDialog();
  const [data, setData] = useState(null);
  // the client pressed "Pay directly" — the vendor confirms once funds arrive
  const [claimed, setClaimed] = useState(!!lead.payment_claimed_at);
  const [amt, setAmt] = useState('');
  const [method, setMethod] = useState('manual');
  const [money, setMoney] = useState({
    deposit_percent: lead.deposit_percent ?? 30,
    deposit_amount: lead.deposit_amount_override ?? '',
    discount_percent: lead.discount_percent ?? 0,
    price_override: lead.price_override ?? '',
  });
  // 💰 Percentage by default; a vendor who typed a fixed amount for THIS
  // booking sees Amount selected when they come back to it. Purely which
  // input shows — nothing saves until a value is actually edited and left,
  // same as every other field here.
  const [depositMode, setDepositMode] = useState(lead.deposit_amount_override != null ? 'amount' : 'percent');
  const [status, setStatus] = useState(lead.status || 'new');
  const [webPay, setWebPay] = useState(lead.web_payment_enabled !== false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    load();   // again when packages are loaded, saved or sent
    // …and the status with them: a send moves the lead on (📤 Package Sent), which this box showed only after a reload
    if (refresh) api.lead(lead.id).then(r => { const s = (r?.lead || r)?.status; if (s) setStatus(s); }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the listed values change; load reads the latest state each time it is called
  }, [refresh]);
  async function load() {
    try { const d = await api.leadPayments(lead.id); setData(d); if (d.summary) setWebPay(d.summary.web_payment_enabled); } catch {}
  }

  // The client pressed "Pay directly"; this is where the vendor says what
  // actually landed. It opens a modal rather than a browser prompt(): a native
  // dialog looks like the browser asking, not the business, and it can't show
  // what the client owes or be styled to match the rest of the panel.
  const [claimModal, setClaimModal] = useState(null);   // { mode: 'confirm' | 'dismiss', amount }

  function openClaim(dismiss) {
    /**
     * 💰 Suggest the deposit, because that is what a client pays first.
     *
     * It used to suggest the outstanding balance, which on an unpaid booking is
     * the whole total — so confirming a deposit meant deleting the suggested
     * figure and typing the right one every time.
     *
     * Once the deposit is actually in, the next payment IS the rest, so from
     * that point the balance is the better guess. Suggesting the deposit
     * unconditionally would offer £300 again on a booking that had already
     * paid it. Either way it is only a starting value — the vendor types over
     * it whenever the client sent something else.
     */
    const sum = data?.summary;
    const deposit = Number(sum?.deposit_amount) || 0;
    const suggested = (Number(sum?.paid) || 0) === 0 && deposit > 0
      ? deposit
      : (sum?.balance ?? deposit ?? '');
    setClaimModal({ mode: dismiss ? 'dismiss' : 'confirm', amount: String(suggested ?? '') });
  }

  // Confirm the money actually landed. This is what records the payment —
  // nothing counts as paid on a client's word, which is why the claim and the
  // confirmation are deliberately separate.
  async function settleClaim() {
    if (!claimModal) return;
    const dismiss = claimModal.mode === 'dismiss';
    let amount = null;
    if (!dismiss) {
      amount = Number(claimModal.amount);
      if (!amount || amount <= 0) { setMsg('⚠️ Enter an amount'); setTimeout(() => setMsg(''), 2500); return; }
    }
    try {
      const d = await api.confirmPaymentClaim(lead.id, dismiss ? { dismiss: true } : { amount, method: 'direct' });
      setData(d);
      // F4 (2026-10-30): the deposit in books the lead on the server — show it now, not after a refresh
      if (d.status && d.status !== status) {
        setStatus(d.status);
        if (d.status === 'booked') { setMsg('✅ Booking confirmed · invoice ready in Contracts & Invoices (not sent)'); setTimeout(() => setMsg(''), 5000); }
      }
      setClaimed(false);
      setClaimModal(null);
    } catch (e) { setMsg('⚠️ ' + e.message); setTimeout(() => setMsg(''), 3000); }
  }
  async function saveMoney() {
    try {
      // Only the active mode's own field is sent. Sending deposit_percent
      // unconditionally would clear a just-typed amount override on the very
      // next unrelated save, and sending both every time would make the
      // toggle meaningless.
      const payload = {
        discount_percent: Number(money.discount_percent) || 0,
        price_override: money.price_override === '' ? null : Number(money.price_override),
      };
      if (depositMode === 'percent') payload.deposit_percent = Number(money.deposit_percent) || 0;
      else payload.deposit_amount = money.deposit_amount === '' ? null : Number(money.deposit_amount);
      const d = await api.saveMoney(lead.id, payload);
      setData(s => ({ ...s, summary: d.summary }));
      setMsg('✅ Saved'); setTimeout(() => setMsg(''), 1500);
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }
  function switchDepositMode(mode) { setDepositMode(mode); }
  async function toggleWebPay() {
    const next = !webPay; setWebPay(next);
    try { await api.setWebPayment(lead.id, next); }
    catch (e) { setWebPay(!next); setMsg('⚠️ ' + e.message); }
  }
  async function pay() {
    if (!amt || Number(amt) <= 0) return;
    try { const d = await api.addPayment(lead.id, Number(amt), method); setData(d); setAmt(''); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function delPay(id) {
    if (!await dialog.confirm('This payment record will be deleted and the balance recalculated.', { title: 'Remove payment?', okLabel: 'Remove' })) return;
    try { await api.deletePayment(id); load(); }
    catch (e) { dialog.alert(e.message, { error: true }); }   // a payment record, of all things
  }
  async function changeStatus(s) {
    setStatus(s);
    try { await api.setLeadStatus(lead.id, s); setMsg('✅ Status: ' + s); setTimeout(() => setMsg(''), 1500); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  const sum = data?.summary;
  const pending = sum ? sum.balance : null;
  return (
    <div className={`ms-wrap ${masked ? 'is-pay-hidden' : ''}`}>
      <div className="ld-card-h ms-pay-h">
        💰 Payments
        {hidePay && (
          <button type="button" className="pay-eye" onClick={() => setReveal(r => !r)} aria-pressed={reveal}
            title={reveal ? 'Hide the amounts' : 'Show the amounts'} aria-label={reveal ? 'Hide the amounts' : 'Show the amounts'}>
            {reveal ? '🙈' : '👁️'}
          </button>
        )}
      </div>
      {masked && <div className="pay-hidden-note">🔒 Amounts are hidden · tap 👁️ to show them</div>}
      {/* 💰 the client says they've paid — confirm it once the money is in.
          Sits at the top because it's the one thing here that needs an action. */}
      {claimed && (
        <div className="ms-claim">
          <p className="ms-claim-t">💰 {lead.name || 'The client'} says they&apos;ve paid{sum && sum.deposit_amount > 0 && <> — deposit <b>{fmtMoney(sum.deposit_amount)}</b> of {fmtMoney(sum.final_total)}</>}</p>
          <p className="ms-claim-b">Confirm once the money is in your account — that&apos;s what records it.</p>
          <div className="ms-claim-acts">
            <button type="button" className="is-primary" onClick={() => openClaim(false)}>✅ Confirm received</button>
            <button type="button" onClick={() => openClaim(true)}>Not yet</button>
          </div>
        </div>
      )}

      {/* 💰 Confirming what landed. In the page rather than a browser prompt, so
          it can show what's owed and reads as the business asking, not Chrome. */}
      {claimModal && (
        <div className="al-overlay" onClick={() => setClaimModal(null)}>
          <div className="gal-set-modal ev-modal" onClick={e => e.stopPropagation()}>
            <div className="al-head">
              <h3 className="al-title">
                {claimModal.mode === 'dismiss' ? '↩️ Not received yet' : '💰 Confirm payment received'}
              </h3>
              <button className="al-x" onClick={() => setClaimModal(null)}>✕</button>
            </div>

            {claimModal.mode === 'dismiss' ? (
              <p className="ev-modal-text">
                Leave <strong>{lead.name || 'this client'}</strong>&apos;s booking as unpaid? Nothing is recorded,
                and you can confirm later when the money arrives.
              </p>
            ) : (
              <>
                <p className="ev-modal-text">
                  How much did you receive from <strong>{lead.name || 'the client'}</strong>?
                </p>
                <label className="lbl" htmlFor="ms-claim-amt">Amount received</label>
                <div className="ms-claim-amt-row">
                  <span className="ms-claim-cur">{moneySymbol()}</span>
                  <input
                    id="ms-claim-amt" className="gal-input" autoFocus type="number" min="0" step="0.01"
                    value={claimModal.amount}
                    onChange={e => setClaimModal(m => ({ ...m, amount: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && settleClaim()}
                  />
                </div>
                {data?.summary && (
                  <p className="ms-claim-hint">
                    Balance outstanding: <strong>{fmtMoney(data.summary.balance)}</strong>
                    {' · '}Deposit: <strong>{fmtMoney(data.summary.deposit_amount)}</strong>
                  </p>
                )}
              </>
            )}

            <div className="ev-modal-foot">
              <button className="refresh ev-modal-cancel" onClick={() => setClaimModal(null)}>Cancel</button>
              <button className="refresh ev-modal-ok" onClick={settleClaim}>
                {claimModal.mode === 'dismiss' ? 'Leave unpaid' : 'Record payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status dropdown + web-payment toggle in one row */}
      <div className="ms-top-row">
        <div className="ms-status-row">
          <label className="ms-status-lbl">Status</label>
          <select className="ms-status-sel" value={status} onChange={e => changeStatus(e.target.value)} title="Lead status: New, Package Sent, or Booking Confirmed">
            {STATUSES.map(s => <option key={s} value={s}>{S_ICON[s]} {S_LABEL[s]}</option>)}
          </select>
        </div>
        <button className={`ms-webpay-chip ${webPay ? 'is-on' : ''}`} onClick={toggleWebPay}
          title={webPay ? 'Client can pay online by card' : 'Client pays in person only'}>
          💻 Online pay: <b>{webPay ? 'ON' : 'OFF'}</b>
        </button>
      </div>
      {msg && <div className={`ms-msg ${msg[0] === '✅' ? 'is-ok' : 'is-err'}`}>{msg}</div>}

      <h3 className="ms-h3">💳 Payment & Deposit</h3>

      {/* deposit % + discount % + custom billed */}
      <div className="ms-fields">
        <div className="ms-field ms-field-deposit">
          <label className="ms-label">Deposit</label>
          <div className="ms-deposit-row">
            <div className="ms-deposit-toggle" title="Deposit as percentage or fixed amount">
              <button type="button" className={depositMode === 'percent' ? 'is-on' : ''}
                onClick={() => switchDepositMode('percent')} title="Deposit as a percentage of the total">%</button>
              <button type="button" className={depositMode === 'amount' ? 'is-on' : ''}
                onClick={() => switchDepositMode('amount')} title="Deposit as a fixed amount">{moneySymbol()}</button>
            </div>
            {depositMode === 'percent' ? (
              <input className="ms-input" type="number" placeholder="30"
                value={money.deposit_percent} onChange={e => setMoney({ ...money, deposit_percent: e.target.value })} onBlur={saveMoney} />
            ) : (
              <input className="ms-input" type="number" placeholder="e.g. 500"
                value={money.deposit_amount} onChange={e => setMoney({ ...money, deposit_amount: e.target.value })} onBlur={saveMoney} />
            )}
          </div>
        </div>
        <div className="ms-field">
          <label className="ms-label">Discount %</label>
          <input className="ms-input" type="number"
            value={money.discount_percent} onChange={e => setMoney({ ...money, discount_percent: e.target.value })} onBlur={saveMoney} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
        </div>
        <div className="ms-field">
          <label className="ms-label">Custom Billed ({moneySymbol()})</label>
          <input className="ms-input" type="number" placeholder="auto"
            value={money.price_override} onChange={e => setMoney({ ...money, price_override: e.target.value })} onBlur={saveMoney} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
        </div>
        <p className="ms-deposit-note ms-deposit-note-full">
          {depositMode === 'percent'
            ? 'Deposit % also becomes your default for new leads.'
            : 'Fixed deposit applies to this booking only — the percentage default is unaffected.'}
        </p>
      </div>

      {/* 3 tiles: Total / Received / Pending */}
      {sum && (
        <div className="ms-tiles">
          <div className="ms-tile ms-tile-total">
            <div className="ms-tile-lbl">Total Amount</div>
            <div className="ms-tile-val">{fmtMoney(sum.final_total)}</div>
            {sum.discount_amount > 0 && <div className="ms-tile-note">was ${sum.base_total}</div>}
          </div>
          <div className="ms-tile ms-tile-recv">
            <div className="ms-tile-lbl">Received</div>
            <div className="ms-tile-val">{fmtMoney(sum.paid)}</div>
          </div>
          <div className={`ms-tile${pending > 0 ? ' ms-tile-pend' : ''}`}>
            <div className="ms-tile-lbl">Pending</div>
            <div className="ms-tile-val">{fmtMoney(pending)}</div>
          </div>
        </div>
      )}
      {sum && (Math.round(sum.paid * 100) >= Math.round(sum.deposit_amount * 100) && sum.deposit_amount > 0
        ? <div className="ms-deposit-line">✅ Deposit paid: <b>{fmtMoney(sum.deposit_amount)}</b> ({sum.deposit_percent}%)</div>
        : <div className="ms-deposit-line">🔐 Deposit due: <b>{fmtMoney(sum.deposit_amount)}</b> ({sum.deposit_percent}%)</div>)}

      {/* manual payments */}
      <div className="ms-mp-head">Manual Payments</div>
      <div className="ms-pay-row">
        <input className="ms-input ms-amt" type="number" placeholder={`Amount ${moneySymbol()}`} value={amt} onChange={e => setAmt(e.target.value)} />
        <select className="ms-input ms-method" value={method} onChange={e => setMethod(e.target.value)}>
          <option value="manual">Manual</option><option value="etransfer">E-transfer</option>
          <option value="cash">Cash</option><option value="card">Card</option>
        </select>
        <button className="refresh bx-primary ms-pay-add" onClick={pay} title="Record a manual payment you already received">+ Add</button>
      </div>

      {data?.payments?.length > 0 ? (
        <div className="ms-pay-list">
          {data.payments.map(p => (
            <div key={p.id} className="ms-pay-item">
              <span>💵 <b>{fmtMoney(p.amount, { decimals: 2 })}</b> · {p.method} · {fmtDateTime(p.paid_at, { dateOnly: true })}</span>
              <span className="bx-del" onClick={() => delPay(p.id)} title="Remove this payment record" role="button">🗑️</span>
            </div>
          ))}
        </div>
      ) : <div className="ms-mp-empty">No manual payments recorded yet.</div>}
    </div>
  );
}
