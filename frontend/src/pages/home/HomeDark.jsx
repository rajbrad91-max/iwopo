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
import './home-dark.css';


export default function HomeDark({ open, trialOk, cycle, setCycle, plans, compare, compareNotes, priceOf, bestSave,
  choosePlan, goPackages, onGoLogin, wl, setWl, joinWaitlist }) {
  const rootRef = useRef(null);

  useEffect(() => {
    return startDarkHome(rootRef.current);
  }, []);

  /* each plan card lists what it adds to the plan before it, from the same rows as the comparison table */
  const rows = compare.flatMap(g => g.rows || []);
  const adds = (p, i) => rows.filter(r => r.cells?.[p.code] === true && (!plans[i - 1] || r.cells?.[plans[i - 1].code] !== true)).slice(0, 3);   // yes/no features only
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
        <div className="navlinks"><a href="#pipe">Features</a><a href="#packages">Pricing</a><a href="/guides">Guides</a><button type="button" onClick={onGoLogin}>Log in</button></div>
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

      <section className="sec pricing-sec" id="packages"><div className="wrap center"><div className="kick">Pricing</div><h2>Simple plans. <em>Serious</em> value.</h2>
        <div className="toggle" role="group" aria-label="Billing cycle">
          <button type="button" className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
          <button type="button" className={cycle === 'annual' ? 'on' : ''} onClick={() => setCycle('annual')}>Yearly{bestSave > 0 && <em>Save up to {bestSave}%</em>}</button>
        </div>
        <div className="plans">
          {plans.map((p, i) => {
            const pr = priceOf(p), isBest = best && p.code === best.code, free = Number(p.price_monthly) === 0;
            return (
              <div key={p.id} className={`plan${isBest ? ' best' : ''}`}>
                {isBest && <span className="tag">Best value</span>}
                <h3>{p.name}</h3><p className="f">{p.tagline}</p>
                <div className="pr">{pr.big}<small>{pr.unit}</small></div><div className="sv">{pr.save}</div>
                <ul>{i > 0 && <li>Everything in {plans[i - 1].name}</li>}{adds(p, i).map(r => <li key={r.key}>{r.label}{r.coming && <span className="soon">soon</span>}</li>)}</ul>
                <button type="button" className={`btn ${isBest ? 'btn-o' : 'btn-g'}`} onClick={() => choosePlan(p, 'package')}>{!open ? 'Join the waitlist' : free ? 'Start free' : `Choose ${p.name}`}</button>
                {p.trial_days > 0 && trialOk && <p className="trial">{p.trial_days}-day free trial</p>}
              </div>
            );
          })}
        </div>
        <details className="compare"><summary>Compare every feature</summary>
          <div className="pt-wrap"><PlanTable plans={plans} groups={compare} notes={compareNotes} priceOf={priceOf} open={open} onChoose={(p) => choosePlan(p, 'package')} /></div>
        </details>
      </div></section>

      <div dangerouslySetInnerHTML={{ __html: EXPLORE_HTML }} />

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
        <div className="endbar"><div className="wrap"><span>© {new Date().getFullYear()} IWOPO, LLC · <a href="mailto:sales@iwopo.com">sales@iwopo.com</a></span>
          <span><a href="#pipe">Features</a> · <a href="#packages">Pricing</a> · <a href="/guides">Guides</a> · <a href="/compare/iwopo-vs-other-studio-software">Compare iwopo</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></span></div></div>
      </div></section>
    </div>
  );
}
