/**
 * ✨ The dark, scroll-driven home page (Design B) — STAGING ONLY while Raj refines it (Raj, 2026-11-13; see
 * lib/previewFlags.js). The visual chapters come from the approved preview (darkMarkup.js, brought to life by
 * darkEngine.js); everything you can click is wired here to the same data and buttons as today's page — prices per
 * country, plan buttons into the sign-up window, the waitlist and log in — all passed in by Selling.jsx.
 */
import { useEffect, useRef } from 'react';
import PlanTable from '../../components/PlanTable';
import { DEVICE_HTML, CHAPTERS_HTML, CHROME_HTML, EXPLORE_HTML } from './darkMarkup';
import { startDarkHome } from './darkEngine';
import { HOME_FAQ } from '../../../../shared/homeFaq';   // ❓ the same list Google is given (backend seoContent.js)
import './home-dark.css';


export default function HomeDark({ open, trialOk, cycle, setCycle, plans, compare, compareNotes, priceOf, bestSave,
  choosePlan, goPackages, onGoLogin, wl, setWl, joinWaitlist }) {
  const rootRef = useRef(null);

  useEffect(() => {
    return startDarkHome(rootRef.current);
  }, []);

  /* ⏸️ Pricing and "Everything in one place" pause like the chapters do (Raj, 2026-11-15). Each is a .hold: the section
     (.hold-pin, at least a screen tall) stays put while the page scrolls through the gap after it (.hold-gap). One taller
     than the screen pauses with its heading just under the top bar — the plans or the feature picker in view below it. */
  useEffect(() => {
    const root = rootRef.current, nav = root.querySelector('.nav');
    const pins = [...root.querySelectorAll('.hold-pin')];
    const holdTop = (el) => {
      const over = window.innerHeight - el.offsetHeight;
      if (over >= 0) return 0;                                                  // fits: the whole screen, content centred
      const head = el.querySelector('.wrap').offsetTop;                         // where its heading starts inside it
      return Math.max(over, nav.offsetHeight + 12 - head);
    };
    const place = () => pins.forEach(el => el.style.setProperty('--hold-top', `${holdTop(el)}px`));
    const seen = new ResizeObserver(place);   // a plan list, the comparison table or a feature opening changes the height
    pins.forEach(el => seen.observe(el));
    window.addEventListener('resize', place);
    place();
    return () => { seen.disconnect(); window.removeEventListener('resize', place); };
  }, []);

  /* each plan card shows its allowances (storage, roughly what fits, AI chats) and every feature it adds to the plan
     before it — all from the same rows as the comparison table (Raj, 2026-11-15: more on the cards, kept compact) */
  const rows = compare.flatMap(g => g.rows || []);
  const cell = (key, p) => rows.find(r => r.key === key)?.cells?.[p.code];
  const adds = (p, i) => rows.filter(r => r.cells?.[p.code] === true && (!plans[i - 1] || r.cells?.[plans[i - 1].code] !== true));   // yes/no features only
  const best = plans.reduce((b, p) => (Number(p.price_monthly) > Number(b?.price_monthly || 0) ? p : b), null);

  const waitlist = () => (wl.done ? <p className="hd-done">You are on the list. We will email you the moment iwopo opens.</p> : (
    <>
      <div className="join">
        <input type="email" autoComplete="email" placeholder="you@yourstudio.com" aria-label="Email" value={wl.email}
          onChange={e => setWl({ ...wl, email: e.target.value, error: '' })} onKeyDown={e => e.key === 'Enter' && joinWaitlist()} />
        <input className="hd-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" value={wl.website} onChange={e => setWl({ ...wl, website: e.target.value })} />
        <button type="button" className="btn btn-o" onClick={joinWaitlist} disabled={wl.busy}>{wl.busy ? 'Adding you…' : 'Join the waitlist'}</button>
      </div>
      {wl.error && <p className="hd-err">{wl.error}</p>}
    </>
  ));

  return (
    <div className="hd" ref={rootRef}>
      <nav className="nav"><div className="wrap">
        <a className="brand" href="/"><img src="/iwopo-mark.png" alt="" />iwopo</a>
        <div className="navlinks"><a href="#explore">Features</a><a href="#packages">Pricing</a><a href="/guides">Guides</a><button type="button" onClick={onGoLogin}>Log in</button></div>
      </div></nav>
      <div dangerouslySetInnerHTML={{ __html: CHROME_HTML }} />

      <section className="scene" id="hero" data-s="hero"><div className="pin"><div className="glow" />
        <div className="hero-copy" id="heroCopy">
          <h1>One place for every wedding vendor, <em>and every need.</em></h1>
          <p className="lede">The complete wedding business platform: bookings, contracts with e-signatures, crew management, calendar, storage and face-recognition galleries.</p>
          {open ? <div className="hd-row"><button type="button" className="btn btn-o" onClick={goPackages}>Choose your plan</button></div> : waitlist()}
        </div>
        <div className="device" id="device" dangerouslySetInnerHTML={{ __html: DEVICE_HTML }} />
      </div></section>

      <div dangerouslySetInnerHTML={{ __html: CHAPTERS_HTML }} />

      <div className="hold"><section className="sec pricing-sec hold-pin" id="packages"><div className="wrap center"><div className="kick">Pricing</div><h2>Simple plans. <em>Serious</em> value.</h2>
        <div className="toggle" role="group" aria-label="Billing cycle">
          <button type="button" className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
          <button type="button" className={cycle === 'annual' ? 'on' : ''} onClick={() => setCycle('annual')}>Yearly{bestSave > 0 && <em>Save up to {bestSave}%</em>}</button>
        </div>
        <div className="plans">
          {plans.map((p, i) => {
            const pr = priceOf(p), isBest = best && p.code === best.code;
            return (
              <div key={p.id} className={`plan${isBest ? ' best' : ''}`}>
                {isBest && <span className="tag">Best value</span>}
                <h3>{p.name}</h3><p className="f">{p.tagline}</p>
                <div className="pr">{pr.big}<small>{pr.unit}</small></div><div className="sv">{pr.save}</div>
                <div className="specs">
                  {cell('storage', p) && <p><b>{cell('storage', p)}</b>storage<span>{cell('capacity', p)}*</span></p>}   {/* * an estimate: see the note under the plans */}
                  {cell('chatbot', p) && <p><b>{cell('chatbot', p)}</b>AI assistant chats a month</p>}
                </div>
                <ul>{i > 0 && <li>Everything in {plans.slice(0, i).map(x => x.name).join(' + ')}</li>}{adds(p, i).map(r => <li key={r.key}>{r.label}{r.coming && <span className="soon">(coming soon)</span>}</li>)}</ul>
                <button type="button" className={`btn ${isBest ? 'btn-o' : 'btn-g'}`} onClick={() => choosePlan(p, 'package')}>{!open ? 'Join the waitlist' : `Choose ${p.name}`}</button>
                {p.trial_days > 0 && trialOk && <p className="trial">{p.trial_days}-day free trial</p>}
              </div>
            );
          })}
        </div>
        <p className="plans-note">* Estimates, not promises — what fits depends on the size of your own photos and videos. The full comparison below explains how they are worked out.</p>
        <details className="compare"><summary>Compare every feature</summary>
          <div className="pt-wrap"><PlanTable plans={plans} groups={compare} notes={compareNotes} priceOf={priceOf} open={open} onChoose={(p) => choosePlan(p, 'package')} /></div>
        </details>
      </div></section><div className="hold-gap" /></div>

      <div className="hold"><div className="hold-pin" dangerouslySetInnerHTML={{ __html: EXPLORE_HTML }} /><div className="hold-gap" /></div>

      <section className="sec faq-sec" id="faq"><div className="wrap center"><div className="kick">Questions</div><h2>Quick <em>answers.</em></h2>
        <div className="faq">{HOME_FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </div></section>

      <section className="scene" id="final" data-s="final"><span className="hd-anchor" id="signup" /><div className="pin"><div className="glow" /><div className="fin"><div>
        <div className="mark"><img id="mark" src="/iwopo-mark.png" alt="" /></div>
        {open ? (
          <><h2>Ready when <em>you</em> are.</h2><p className="sub mid">Pick the plan that fits. Essential and Pro start with a free trial, no card needed.</p>
            <div className="hd-row"><button type="button" className="btn btn-o" onClick={goPackages}>Choose your plan</button></div></>
        ) : (
          <><h2>Be first when <em>iwopo</em> opens.</h2><p className="sub mid">Join the waitlist. One email when we open, nothing else.</p>{waitlist()}</>
        )}
        <p className="hd-login">Already have an account? <button type="button" onClick={onGoLogin}>Log in</button></p>
      </div></div>
        {/* the page ends here, everything centred; the links run along the bottom of this last screen */}
        <div className="endbar"><div className="wrap"><span>© {new Date().getFullYear()} IWOPO, LLC · <span className="addr">3 Germay Dr, Unit 4 #3327, Wilmington, DE 19804</span> · <a href="mailto:sales@iwopo.com">sales@iwopo.com</a></span>
          <span><a href="#explore">Features</a> · <a href="#packages">Pricing</a> · <a href="/guides">Guides</a> · <a href="/compare/iwopo-vs-other-studio-software">Compare iwopo</a> · <a href="#faq">FAQ</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refund-policy">Refunds</a> · <a href="/cookies">Cookies</a></span></div></div>
      </div></section>
    </div>
  );
}
