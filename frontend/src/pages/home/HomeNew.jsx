/**
 * ✨ The new public home page — STAGING ONLY while Raj and Claude refine it (Raj, 2026-11-12; see lib/previewFlags.js).
 * Design: real product screens in 3D depth, purposeful motion, Raj's own portfolio photos, ivory and night with the
 * logo's orange and teal, Fraunces headlines. It owns no data and no logic of its own: Selling.jsx passes the same
 * prices, plan buttons, sign-up window, waitlist and log-in that today's page uses, so every button does exactly what
 * it does there. No emoji, no "AI", no competitor named.
 */
import { useEffect, useRef, useState } from 'react';
import PlanTable from '../../components/PlanTable';
import './home-new.css';

const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&display=swap';
const CAL = [['1'], ['2', 'Mehndi', 'o'], ['3', 'Jaggo', 't'], ['4', 'Choora', 'b'], ['5', 'Wedding', 'i'], ['6'], ['7'], ['8'], ['9'], ['10'], ['11', 'Shoot', 't'], ['12'], ['13', 'Reception', 'o'], ['14'], ['15'], ['16'], ['17'], ['18'], ['19', 'Wedding', 'b'], ['20'], ['21']];
const WALL = [[1, 'm'], [2, ''], [3, ''], [5, 'm'], [4, ''], [6, 'm'], [7, ''], [2, 'b'], [5, 'b'], [3, 'b'], [1, 'mb'], [4, 'b']];
const STEPS = [
  ['Inquiry arrives', 'Your form, your brand', [['Maya & Adam', 'New', 'new'], ['Wedding · 5 Dec', '200 guests'], ['Mehndi · Jaggo', '3 events']]],
  ['Packages sent', 'Their events, their prices', [['Classic', '$4,500'], ['Signature', '$5,300'], ['Sent to Maya', 'Opened', 'or']]],
  ['Contract signed', 'From any phone, in minutes', [['Agreement', 'Signed', 'ok'], ['Maya · 12 Nov', 'e-signature'], ['Record sealed', '✓']]],
  ['Deposit paid', 'Straight to your account', [['Deposit', 'Paid', 'ok'], ['Online', '$1,500'], ['Balance due', '$3,000']]],
  ['Gallery delivered', 'Every guest finds their photos', [['Gallery', 'Delivered', 'ok'], ['3,812 photos', '2 films'], ['Guests found', '186']]],
];
const BENTO = { gallery: 'nh-s4 nh-tall nh-dark', leads: 'nh-s2', contracts: 'nh-s2', bookings: 'nh-s2', invoices: 'nh-s2', crew: 'nh-s2', cloud: 'nh-s2', video: 'nh-s2 nh-photo', transfer: 'nh-s2', ai: 'nh-s3' };
const FAQ = [
  ['When can I join?', 'iwopo opens to new wedding businesses very soon. Join the waitlist and we will email you the moment it does.'],
  ['Does iwopo work in my country?', 'Yes. iwopo works in every country, with your own time zone and currency, and prices shown in local currency in many countries.'],
  ['Can my team use it too?', 'Yes. Pro and Studio include crew management: assign your team to every event and keep everyone on the same schedule.'],
  ['Can I keep my current bookings where they are?', 'Yes. Many studios run new inquiries through iwopo and let existing bookings finish where they are.'],
  ['What happens to my files if I leave?', 'They are yours. You can download your galleries and records at any time.'],
];
const SIG = 'M6 36c10-22 18-26 22-12s-4 22 6 8 16-30 20-18-6 26 6 14 14-20 22-12 2 18 14 10 18-16 26-8 10 10 20 4 16-8 24-2';

/** the tiny real piece of iwopo each feature card shows */
function Mini({ id }) {
  if (id === 'gallery') return <div className="nh-stack"><i className="nh-ph-3" /><i className="nh-ph-2" /><i className="nh-ph-1" /></div>;
  if (id === 'leads') return <div className="nh-vis nh-rows"><p><b>Maya &amp; Adam</b><em className="nh-pill new">New</em></p><p><b>Lina &amp; Omar</b><em className="nh-pill or">Packages sent</em></p></div>;
  if (id === 'contracts') return <div className="nh-vis nh-sig"><svg viewBox="0 0 200 50" aria-hidden="true"><path d={SIG} /></svg></div>;
  if (id === 'bookings') return <div className="nh-vis nh-cal nh-cal-row">{CAL.slice(1, 8).map(([d, e, c]) => <div key={d}>{d}{e && <span className={`nh-ev ${c}`}>{e}</span>}</div>)}</div>;
  if (id === 'invoices') return <div className="nh-vis nh-rows"><p><span>Deposit</span><em className="nh-pill ok">Paid</em></p><p><span>Balance</span><em className="nh-pill or">Due 1 Dec</em></p></div>;
  if (id === 'crew') return <div className="nh-vis nh-avatars"><i className="nh-ph-2" /><i className="nh-ph-6" /><i className="nh-ph-7" /><i className="nh-ph-4" /></div>;
  if (id === 'cloud') return <div className="nh-vis nh-prog"><span className="nh-meter"><i /></span><span>620 GB</span></div>;
  if (id === 'video') return <span className="nh-play" aria-hidden="true" />;
  if (id === 'transfer') return <div className="nh-vis nh-prog"><span className="nh-meter fast"><i /></span><span>48 GB</span></div>;
  if (id === 'ai') return <div className="nh-vis nh-chat"><span className="nh-bub in">Do you cover multi-day weddings?</span><span className="nh-bub out">Yes, every event from the Mehndi to the reception. Here are our packages.</span></div>;
  return null;
}

export default function HomeNew({ open, trialOk, cycle, setCycle, plans, compare, compareNotes, priceOf, bestSave,
  choosePlan, goSignup, goPackages, onGoLogin, wl, setWl, joinWaitlist, features, trades }) {
  const stageRef = useRef(null);
  const [faq, setFaq] = useState(0);

  useEffect(() => {
    if (document.getElementById('nh-fonts')) return;
    const l = document.createElement('link'); l.id = 'nh-fonts'; l.rel = 'stylesheet'; l.href = FONTS; document.head.appendChild(l);
  }, []);
  /* the hero's 3D screens lean towards the pointer (CSS reads --tx / --ty) */
  function tilt(e) {
    const el = stageRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--tx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    el.style.setProperty('--ty', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  }
  function untilt() { const el = stageRef.current; if (el) { el.style.setProperty('--tx', 0); el.style.setProperty('--ty', 0); } }

  const cta = open ? 'Choose your plan' : 'Join the waitlist';
  /* each card lists what this plan adds to the one before it, from the same rows as the comparison table */
  const rows = compare.flatMap(g => g.rows || []);
  const adds = (p, i) => {
    const prev = plans[i - 1];
    return rows.filter(r => r.cells?.[p.code] && (!prev || !r.cells?.[prev.code])).slice(0, 4);
  };
  const best = plans.reduce((b, p) => (Number(p.price_monthly) > Number(b?.price_monthly || 0) ? p : b), null);

  const waitlistBox = (dark) => (
    wl.done ? <p className={`nh-done${dark ? ' dark' : ''}`}>You are on the list. We will email you the moment iwopo opens.</p> : (
      <>
        <div className={`nh-join${dark ? ' dark' : ''}`}>
          <input type="email" autoComplete="email" placeholder="you@yourstudio.com" aria-label="Email" value={wl.email}
            onChange={e => setWl({ ...wl, email: e.target.value, error: '' })} onKeyDown={e => e.key === 'Enter' && joinWaitlist()} />
          <input className="nh-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" value={wl.website} onChange={e => setWl({ ...wl, website: e.target.value })} />
          <button type="button" className="nh-btn orange" onClick={joinWaitlist} disabled={wl.busy}>{wl.busy ? 'Adding you…' : 'Join the waitlist'}</button>
        </div>
        {wl.error && <p className="nh-err">{wl.error}</p>}
      </>
    )
  );

  return (
    <div className="nh">
      <nav className="nh-nav"><div className="nh-wrap">
        <a href="/" className="nh-brand" aria-label="iwopo home"><img src="/iwopo-mark.png" alt="" />iwopo</a>
        <div className="nh-links"><a href="#features">Features</a><a href="#packages">Pricing</a><a href="/guides">Guides</a><a href="#faq">FAQ</a>
          <button type="button" onClick={onGoLogin}>Log in</button></div>
        <button type="button" className="nh-btn ink" onClick={goSignup}>{cta}</button>
      </div></nav>

      <header className="nh-hero"><div className="nh-wrap">
        <div>
          <span className="nh-eyebrow"><i />For every wedding business, in every country</span>
          <h1>Run your wedding business in <em>one place.</em></h1>
          <p className="nh-lede">The complete wedding business platform: bookings, contracts with e-signatures, crew management, calendar, storage and face-recognition galleries.</p>
          {open ? (
            <div className="nh-hero-btns"><button type="button" className="nh-btn orange lg" onClick={goPackages}>Choose your plan</button><a href="#flow" className="nh-btn ghost lg">See how it works</a></div>
          ) : waitlistBox(false)}
          <div className="nh-facts"><span><b />Works in every country</span><span><b />Prices in your currency</span><span><b />Seven languages</span></div>
        </div>
        <div className="nh-stage" ref={stageRef} onMouseMove={tilt} onMouseLeave={untilt} aria-hidden="true"><div className="nh-floaty"><div className="nh-rig">
          <div className="nh-win nh-w-cal"><div className="nh-bar"><i /><i /><i /><span>December</span></div>
            <div className="nh-cal">{CAL.map(([d, e, c]) => <div key={d}>{d}{e && <span className={`nh-ev ${c}`}>{e}</span>}</div>)}</div></div>
          <div className="nh-win nh-w-gal"><div className="nh-bar"><i /><i /><i /><span>Maya &amp; Adam — Wedding gallery</span></div>
            <div className="nh-galgrid"><div className="nh-big nh-ph-1"><span className="nh-face f1" /><span className="nh-face f2" /><span className="nh-scan" />
              <span className="nh-who"><em className="nh-ph-1" />Maya · 214 photos found</span></div>
              <div className="nh-ph-2" /><div className="nh-ph-3" /><div className="nh-ph-4" /><div className="nh-ph-5" /></div></div>
          <div className="nh-win nh-w-con"><h5>Wedding photography agreement</h5><p>Maya &amp; Adam · 5 December</p><div className="nh-lines"><i /><i /><i /></div>
            <div className="nh-sig"><svg viewBox="0 0 200 50"><path d={SIG} /></svg></div><div className="nh-seal"><b>✓</b>Signed · sealed with a tamper-proof record</div></div>
          <div className="nh-toast"><span>$</span><div><b>Deposit received</b><small>Maya &amp; Adam · paid online</small></div></div>
        </div></div></div>
      </div></header>

      <div className="nh-strip"><div className="nh-wrap"><div><b>Every country</b><span>sign up from anywhere</span></div><div><b>17 currencies</b><span>fixed local prices</span></div>
        <div><b>7 languages</b><span>on the public site</span></div><div><b>One subscription</b><span>instead of a stack of tools</span></div></div></div>

      <section className="nh-night nh-faces"><div className="nh-wrap">
        <div><div className="nh-kick">Advanced galleries</div><h2>Every guest finds <em>every photo</em> of themselves.</h2>
          <p className="nh-sub">A guest takes one selfie. Face recognition searches the whole wedding, thousands of photos, and brings back theirs in seconds.</p>
          <ul className="nh-ticks"><li>Faces grouped automatically after you upload</li><li>Favourites and one-click downloads for every guest</li><li>Films and highlight reels in the same gallery</li></ul></div>
        <div className="nh-wall" aria-hidden="true"><div className="nh-plane">{WALL.map(([n, k], i) => <div key={i} className={`nh-tile-ph nh-ph-${n}${k.includes('m') ? ' m' : ''}${k.includes('b') ? ' alt' : ''}`} />)}</div>
          <div className="nh-beam" /><div className="nh-match"><em className="nh-ph-1" /><div><b>214 photos of you</b><span>Found across the whole wedding</span></div></div></div>
      </div></section>

      <section className="nh-flow" id="flow"><div className="nh-wrap nh-center">
        <div className="nh-kick">How it flows</div><h2>From first inquiry to <em>final gallery.</em></h2>
        <p className="nh-sub nh-mid">Every step of a wedding, connected. Nothing to copy between tools, nothing forgotten.</p>
        <div className="nh-journey"><div className="nh-track"><i /><b /></div><div className="nh-steps">
          {STEPS.map(([t, s, r], i) => (
            <div className="nh-step" key={t}><div className="nh-card nh-rows">{r.map(([a, b, pill]) => <p key={a}><b>{a}</b>{pill ? <em className={`nh-pill ${pill}`}>{b}</em> : <span>{b}</span>}</p>)}</div>
              <span className="nh-n">{i + 1}</span><h4>{t}</h4><p>{s}</p></div>))}
        </div></div>
      </div></section>

      <section id="features" className="nh-features"><div className="nh-wrap">
        <div className="nh-kick">Features</div><h2>Built for the way <em>weddings</em> really work.</h2>
        <div className="nh-bento">
          {features.map(f => (
            <article key={f.id} className={`nh-tile ${BENTO[f.id] || 'nh-s2'}`}>
              {f.id === 'video' && <span className="nh-shade" />}
              <div className="nh-tile-copy"><h3>{f.name}</h3><p>{f.desc}</p></div><Mini id={f.id} />
            </article>
          ))}
          <article className="nh-tile nh-s3"><div className="nh-tile-copy"><h3>Your website</h3><p>A portfolio site with your inquiry form built in, on your own domain with Studio.</p></div>
            <div className="nh-vis nh-rows"><p><b>yourstudio.com</b><em className="nh-pill ok">Live</em></p><p><span>Inquiry form</span><span>Built in</span></p></div></article>
        </div>
      </div></section>

      <section className="nh-vendors"><div className="nh-wrap nh-center"><div className="nh-kick">Made for every wedding vendor</div><h2>Whatever you create for the big day.</h2></div>
        <div className="nh-marq" aria-hidden="true"><div className="nh-marq-row">{[...trades, ...trades].map((t, i) => <span key={i}>{t}</span>)}</div></div>
      </section>

      <section className="nh-pricing" id="packages"><div className="nh-wrap nh-center">
        <div className="nh-kick">Pricing</div><h2>Simple plans. <em>Serious</em> value.</h2>
        <div className="nh-toggle" role="group" aria-label="Billing cycle">
          <button type="button" className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
          <button type="button" className={cycle === 'annual' ? 'on' : ''} onClick={() => setCycle('annual')}>Yearly{bestSave > 0 && <em>Save up to {bestSave}%</em>}</button>
        </div>
        <div className="nh-plans">
          {plans.map((p, i) => {
            const pr = priceOf(p); const isBest = best && p.code === best.code; const free = Number(p.price_monthly) === 0;
            return (
              <div key={p.id} className={`nh-plan${isBest ? ' best' : ''}`}>
                {isBest && <span className="nh-tag">Best value</span>}
                <h3>{p.name}</h3><p className="nh-for">{p.tagline}</p>
                <div className="nh-price">{pr.big}<small>{pr.unit}</small></div><div className="nh-save">{pr.save}</div>
                <ul>{i > 0 && <li>Everything in {plans[i - 1].name}</li>}{adds(p, i).map(r => <li key={r.key}>{r.label}{r.coming && <span className="nh-soon">soon</span>}</li>)}</ul>
                <button type="button" className={`nh-btn ${isBest ? 'orange' : 'ghost'}`} onClick={() => choosePlan(p, 'package')}>{!open ? 'Join the waitlist' : free ? 'Start free' : `Choose ${p.name}`}</button>
                {p.trial_days > 0 && trialOk && <p className="nh-trial">{p.trial_days}-day free trial</p>}
              </div>
            );
          })}
        </div>
        <details className="nh-compare"><summary>Compare every feature</summary>
          <PlanTable plans={plans} groups={compare} notes={compareNotes} priceOf={priceOf} open={open} onChoose={(p) => choosePlan(p, 'package')} />
        </details>
      </div></section>

      <section className="nh-faq" id="faq"><div className="nh-wrap nh-faq-grid"><div><div className="nh-kick">FAQ</div><h2>Questions, <em>answered.</em></h2></div>
        <div className="nh-qa">{FAQ.map(([q, a], i) => (
          <div key={q} className={faq === i ? 'open' : ''}><button type="button" onClick={() => setFaq(faq === i ? -1 : i)} aria-expanded={faq === i}>{q}<span>{faq === i ? '−' : '+'}</span></button>{faq === i && <p>{a}</p>}</div>))}</div>
      </div></section>

      <section className="nh-night nh-final" id="signup"><div className="nh-wrap nh-center">
        <div className="nh-mark3d"><img src="/iwopo-mark.png" alt="" /></div>
        {open ? (
          <><h2>Ready when <em>you</em> are.</h2><p className="nh-sub nh-mid">Pick the plan that fits. Essential and Pro start with a free trial, no card needed.</p>
            <div className="nh-hero-btns nh-mid-row"><button type="button" className="nh-btn orange lg" onClick={goPackages}>Choose your plan</button></div></>
        ) : (
          <><h2>Be first when <em>iwopo</em> opens.</h2><p className="nh-sub nh-mid">Join the waitlist. One email when we open, nothing else.</p>{waitlistBox(true)}</>
        )}
        <p className="nh-login">Already have an account? <button type="button" onClick={onGoLogin}>Log in</button></p>
      </div></section>

      <footer className="nh-foot"><div className="nh-wrap">
        <div><a href="/" className="nh-brand"><img src="/iwopo-mark.png" alt="" />iwopo</a><p>The complete wedding business platform.</p></div>
        <div><h6>Product</h6><a href="#features">Features</a><a href="#packages">Pricing</a><a href="/compare/iwopo-vs-other-studio-software">Compare iwopo</a></div>
        <div><h6>Learn</h6><a href="/guides">Guides</a><a href="#faq">FAQ</a><a href="/locations">Countries</a></div>
        <div><h6>Legal</h6><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refund-policy">Refunds</a><a href="/cookies">Cookies</a></div>
        <p className="nh-copy">© {new Date().getFullYear()} IWOPO, LLC · 3 Germay Dr, Unit 4 #3327, Wilmington, DE 19804 · <a href="mailto:sales@iwopo.com">sales@iwopo.com</a></p>
      </div></footer>
    </div>
  );
}
