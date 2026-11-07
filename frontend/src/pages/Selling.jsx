import { useState, useEffect, useRef } from 'react';
import { passwordReady } from '../lib/passwordRules';
import VerifyCode from '../components/VerifyCode';
import { api, setSession } from '../lib/api';
import PasswordInput from '../components/PasswordInput';
import { PROFESSION_LIST } from '../lib/professions';
import './selling.css';
import PlanTable, { planPriceOf } from '../components/PlanTable';

/**
 * Reveal-on-scroll. Skipped for reduced-motion via CSS; observer still adds
 * `.in` so content is never stuck invisible.
 */
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('in'); io.unobserve(el); } },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
function Reveal({ children, className = '', style, as: Tag = 'div' }) {
  const ref = useReveal();
  return <Tag ref={ref} className={`reveal ${className}`} style={style}>{children}</Tag>;
}

function useCountUp(target, run) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf, start;
    const dur = 1400;
    const tick = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return n;
}

const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Sora:wght@400;500;600;700&display=swap';

const FEATURES = [
  { id: 'gallery', name: 'Advanced Galleries', desc: 'Private, watermarked galleries clients love — face search, favorites, one-click downloads.' },
  { id: 'leads', name: 'Lead management', desc: 'Every inquiry captured, qualified, and tracked from first message to signed booking.' },
  { id: 'bookings', name: 'Bookings & calendar', desc: 'See every event, hold, and deadline in one calendar built around wedding season.' },
  { id: 'contracts', name: 'Contracts', desc: 'Send, e-sign, and store agreements with a signing certificate on every one.' },
  { id: 'invoices', name: 'Invoices & payments', desc: 'Deposits, balances, and payment records — always know who owes what.' },
  { id: 'crew', name: 'Crew management', desc: 'Assign shooters, editors, and assistants to events and keep everyone in sync.' },
  { id: 'cloud', name: 'Cloud storage', desc: 'Room for raw footage and full-resolution galleries, scaling as you grow.' },
  { id: 'video', name: 'Video uploads', desc: 'Deliver films and highlight reels alongside photos in the same gallery.' },
  { id: 'transfer', name: 'Large file transfer', desc: 'Move multi-gigabyte deliveries without wrestling with third-party tools.' },
  { id: 'ai', name: 'AI assistant', desc: 'Answers inquiries, qualifies leads, and books meetings around the clock.' },
];

/**
 * Small 3D scene per feature. Shapes are meant to read in one glance
 * (calendar = bookings, face+scan = Advanced Galleries, etc.).
 */
function FeatVisual({ id }) {
  return (
    <div className={`sl-fv sl-fv-${id}`} aria-hidden="true">
      <span className="sl-fv-floor" />
      {id === 'gallery' && (
        <>
          <span className="sl-fv-photo sl-fv-photo-back" />
          <span className="sl-fv-photo sl-fv-photo-front">
            <span className="sl-fv-face" />
            <span className="sl-fv-scan" />
          </span>
        </>
      )}
      {id === 'leads' && (
        <>
          <span className="sl-fv-inbox" />
          <span className="sl-fv-card sl-fv-card-1" />
          <span className="sl-fv-card sl-fv-card-2" />
          <span className="sl-fv-person" />
        </>
      )}
      {id === 'bookings' && (
        <>
          <span className="sl-fv-cal">
            <span className="sl-fv-cal-top" />
            <span className="sl-fv-cal-day">14</span>
            <span className="sl-fv-cal-dots" />
          </span>
        </>
      )}
      {id === 'contracts' && (
        <>
          <span className="sl-fv-doc">
            <span className="sl-fv-lines" />
            <span className="sl-fv-sign" />
          </span>
          <span className="sl-fv-seal" />
        </>
      )}
      {id === 'invoices' && (
        <>
          <span className="sl-fv-bill">
            <span className="sl-fv-bill-amt">$</span>
            <span className="sl-fv-bill-rows" />
          </span>
          <span className="sl-fv-paid">PAID</span>
        </>
      )}
      {id === 'crew' && (
        <>
          <span className="sl-fv-av a1" />
          <span className="sl-fv-av a2" />
          <span className="sl-fv-av a3" />
          <span className="sl-fv-link" />
        </>
      )}
      {id === 'cloud' && (
        <>
          <span className="sl-fv-cloud-body" />
          <span className="sl-fv-cloud-bump l" />
          <span className="sl-fv-cloud-bump r" />
          <span className="sl-fv-up" />
        </>
      )}
      {id === 'video' && (
        <>
          <span className="sl-fv-screen">
            <span className="sl-fv-play" />
          </span>
          <span className="sl-fv-reel" />
        </>
      )}
      {id === 'transfer' && (
        <>
          <span className="sl-fv-folder">
            <span className="sl-fv-tab" />
          </span>
          <span className="sl-fv-arrow" />
        </>
      )}
      {id === 'ai' && (
        <>
          <span className="sl-fv-bot">
            <span className="sl-fv-eye l" />
            <span className="sl-fv-eye r" />
            <span className="sl-fv-ant" />
          </span>
          <span className="sl-fv-bubble" />
        </>
      )}
    </div>
  );
}

/* Advertised straight from the shared list, so this page cannot offer a trade
   a vendor is unable to select. It previously listed Venues, Decorators, Live
   bands and Hair stylists, none of which existed anywhere else in the product. */
const INDUSTRIES = PROFESSION_LIST.map(p => [p.icon, p.label]);

const FAQ = [
  ['Is there really a free trial?', 'Yes. Start on a trial with no card required. When it ends you simply choose a plan to keep going — nothing is charged automatically.'],
  ['Do I have to buy the whole platform?', 'No. Take a full package, or add just the pieces you need — galleries, the vendor suite, cloud storage, or the AI assistant — and add more anytime.'],
  ['Will my galleries be private?', 'Every gallery is private by default, with watermarking, download controls, and per-client access. Your clients only see what you share.'],
  ['What happens to my files if I leave?', "They're yours. You can download your galleries and records at any time — there's no lock-in on your work."],
];

export default function Selling({ onSignup, onGoLogin }) {
  const [packages, setPackages] = useState([]);
  const [compare, setCompare] = useState([]);   // 📊 the same plans, row by row (PlanTable)
  const [compareNotes, setCompareNotes] = useState([]);   // the * small print under the table
  const [cycle, setCycle] = useState('monthly');
  // 🎟️ a share link (iwopo.com/?ref=CODE) fills the referral code in — kept for the visit, in case they look around first
  const [form, setForm] = useState(() => {
    let referral = '';
    try {
      referral = new URLSearchParams(window.location.search).get('ref') || sessionStorage.getItem('iwopo_ref') || '';
      if (referral) sessionStorage.setItem('iwopo_ref', referral);
    } catch { /* private mode: the link still fills it this time */ }
    return { businessName: '', email: '', password: '', profession: '', marketing: false, referral: referral.toUpperCase() };
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verify, setVerify] = useState(null);   // ✉️ { email, code } after sign-up: the emailed code comes next
  const [trialOk, setTrialOk] = useState(true);
  const [open, setOpen] = useState(true);   // 🚧 false while sign-ups are paused before launch
  const [chosen, setChosen] = useState(null);
  const [buying, setBuying] = useState(false);   // 💳 the sign-up window a plan's button opens
  const [faqOpen, setFaqOpen] = useState(0);
  const [heroSeen, setHeroSeen] = useState(false);
  const heroRef = useRef(null);
  const revenue = useCountUp(48250, heroSeen);

  useEffect(() => {
    if (!document.getElementById('sl-fonts')) {
      const l = document.createElement('link');
      l.id = 'sl-fonts'; l.rel = 'stylesheet'; l.href = FONTS_CSS;
      document.head.appendChild(l);
    }
  }, []);

  useEffect(() => {
    api.packages().then(d => { setPackages(d.packages || []); setCompare(d.compare || []); setCompareNotes(d.compare_notes || []); }).catch(() => {});
    api.trialEligible().then(d => { setTrialOk(d.eligible); setOpen(d.open !== false); }).catch(() => {});
    const t = setTimeout(() => setHeroSeen(true), 250);
    return () => clearTimeout(t);
  }, []);

  /* Mouse tilt for the 3D stage — CSS reads --px / --py */
  useEffect(() => {
    function onMove(e) {
      const el = heroRef.current;
      if (!el) return;
      const x = (e.clientX / window.innerWidth - 0.5);
      const y = (e.clientY / window.innerHeight - 0.5);
      el.style.setProperty('--px', `${x * 22}px`);
      el.style.setProperty('--py', `${y * 14}px`);
      el.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  /* 🎯 An account starts from a plan choice, never on its own (Raj, 2026-11-07): the general buttons take the visitor to
     the plans; a plan's own button opens the sign-up window. While sign-ups are paused: the Opening-soon section. */
  function goSignup() {
    document.getElementById(open ? 'packages' : 'signup')?.scrollIntoView({ behavior: 'smooth' });
  }
  function goPackages() { document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth' }); }
  /* 💳 A plan's button opens the sign-up right where the visitor is (it used to scroll to the bottom of the page) */
  function choosePlan(item, kind) { setChosen({ ...item, kind, cycle }); if (open) setBuying(true); else goSignup(); }
  const paidChoice = chosen?.kind === 'package' && Number(chosen.price_monthly) > 0;

  /* A confirmed account that chose a paid plan goes straight to Stripe's payment page — no detour through the panel.
     If the payment page can't be made, the account still exists and the panel's Plans page takes the payment. */
  async function afterSignedIn(token, user) {
    setSession(token, user);
    if (paidChoice) {
      try {
        const r = await api.billingCheckout(chosen?.id, chosen?.cycle || cycle);
        if (r?.url) { window.location.assign(r.url); return; }
      } catch { /* falls through to the panel */ }
    }
    onSignup(user);
  }

  async function handleSignup() {
    setError('');
    if (!form.businessName || !form.email || !form.password) { setError('Please fill in all fields'); return; }
    if (!form.profession) { setError('Please choose your trade — or Other'); return; }
    if (!passwordReady(form.password, { email: form.email, business: form.businessName })) { setError('Choose a stronger password — follow the checklist under the box.'); return; }
    setLoading(true);
    try {
      const r = await api.signup({
        businessName: form.businessName, email: form.email, password: form.password, profession: form.profession,
        marketing: form.marketing, referral_code: form.referral.trim(),
        ...(paidChoice ? { plan_id: chosen.id, cycle: chosen.cycle || cycle } : {}),   // 💳 remembered on the account
      });
      if (r.verify) { setBuying(false); setVerify({ email: r.email, code: r.sandbox_code, notSent: r.not_sent, ticket: r.ticket }); return; }   // ✉️ confirm the address first
      await afterSignedIn(r.token, r.user);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const realPkgs = packages.filter(p => p.price_monthly != null);
  const priceOf = (p) => planPriceOf(p, cycle);   // 🌍 shared with the table everywhere it appears (PlanTable)

  /* ✍️ The sign-up fields, in the one sign-up window (p = id prefix) */
  const signupForm = (p) => (
    <>
        <label htmlFor={`${p}-biz`}>Business name</label>
        <input id={`${p}-biz`} value={form.businessName} onChange={e => set('businessName', e.target.value)} placeholder="e.g. Rosewood Photography" />
        {/* 🧑‍💼 their trade: Contract setup shows them a sample contract for it (Other: a general one) */}
        <label htmlFor={`${p}-trade`}>Your trade</label>
        <select id={`${p}-trade`} value={form.profession} onChange={e => set('profession', e.target.value)}>
          <option value="" disabled hidden>Choose your trade…</option>
          {PROFESSION_LIST.map(p => <option key={p.key} value={p.key}>{p.icon} {p.label}</option>)}
        </select>
        <label htmlFor={`${p}-email`}>Email</label>
        <input id={`${p}-email`} value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@studio.com" />
        <label htmlFor={`${p}-pass`}>Password</label>
        <PasswordInput id={`${p}-pass`} checklist={{ email: form.email, business: form.businessName }} value={form.password} onChange={e => set('password', e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSignup()} placeholder="••••••••" />
        {error && <div className="sl-err">{error}</div>}
        {/* 🎟️ a friend's code: first month free on a paid plan — optional */}
        <label htmlFor={`${p}-ref`}>Referral code <span className="sl-optional">(optional)</span></label>
        <input id={`${p}-ref`} value={form.referral} onChange={e => set('referral', e.target.value.toUpperCase())} placeholder="e.g. ROSEWOOD-7K2F" autoComplete="off" />
        {form.referral.trim() && <p className="sl-ref-note">🎁 With a friend's code, your first month on a paid plan is free.</p>}
        {/* 📬 offers only with consent — unticked; changeable any time in My Services */}
        <label className="sl-optin"><input type="checkbox" checked={form.marketing} onChange={e => set('marketing', e.target.checked)} /> <span>Email me occasional offers and news from iwopo. Unsubscribe any time.</span></label>
        <button type="button" className="sl-cta full" onClick={handleSignup} disabled={loading}>
          {loading ? 'Creating…' : p === 'buy' && paidChoice ? 'Create account & continue' : 'Create account'}
        </button>
        <p className="sl-consent">By creating an account you agree to our <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</p>
    </>
  );
  const chosenPrice = chosen ? planPriceOf(chosen, chosen.cycle || cycle) : null;
  const buyLine = !chosen ? ''
    : Number(chosen.price_monthly) === 0 ? 'Free forever'
    : `${chosenPrice.cur === '≈' ? `≈ ${chosenPrice.big}` : `$${chosenPrice.big}`}${chosenPrice.unit}`
      + (chosen.trial_days > 0 && trialOk ? ` · ${chosen.trial_days}-day free trial, nothing charged today` : ' · charged today, cancel anytime');

  return (
    <div className="sl">
      {verify && (
        <div className="vc-overlay" role="dialog" aria-label="Confirm your email">
          <div className="sl-signup-box sl-buy sl-verify">
            <VerifyCode email={verify.email} sandboxCode={verify.code} notSent={verify.notSent} ticket={verify.ticket}
              onVerified={({ token, user }) => afterSignedIn(token, user)} onBack={() => setVerify(null)}
              onAlreadyConfirmed={() => { setVerify(null); onGoLogin(); }} />
          </div>
        </div>
      )}
      {buying && chosen && (
        <div className="vc-overlay" role="dialog" aria-label={`Start ${chosen.name}`}>
          <div className="sl-signup-box sl-buy">
            <button type="button" className="sl-buy-x" aria-label="Close" onClick={() => setBuying(false)}>×</button>
            <h3 className="sl-buy-title">Start {chosen.name}</h3>
            <p className="sl-buy-price">{buyLine}</p>
            <ol className="sl-buy-steps">
              <li className="is-on">Your account</li>
              <li>Confirm your email</li>
              {paidChoice && <li>Pay securely with Stripe</li>}
            </ol>
            {signupForm('buy')}
          </div>
        </div>
      )}
      <nav className="sl-nav">
        <div className="sl-nav-inner">
          <a href="/" className="sl-logo" aria-label="iwopo home">
            <img src="/iwopo-mark.png" alt="" className="sl-logo-img" />
            <span className="sl-logo-word">iwopo</span>
          </a>
          <div className="sl-nav-links">
            <a href="#features">Features</a>
            <a href="#packages">Pricing</a>
            <a href="/guides">Guides</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="sl-nav-actions">
            <button type="button" className="sl-ghost" onClick={onGoLogin}>Log in</button>
            <button type="button" className="sl-cta-sm" onClick={goSignup}>{open ? 'Choose your plan' : 'Opening soon'}</button>
          </div>
        </div>
      </nav>

      {/* Hero: brand + one promise + CTAs + 3D product — first viewport does one job */}
      <header className="sl-hero" ref={heroRef}>
        <div className="sl-hero-mesh" aria-hidden="true" />
        <div className="sl-hero-orb o1" aria-hidden="true" />
        <div className="sl-hero-orb o2" aria-hidden="true" />
        <div className="sl-hero-grid">
          <div className="sl-hero-copy">
            <p className="sl-brand-mark">iwopo</p>
            <h1>Run your wedding business in <em>one place.</em></h1>
            <p className="sl-lede">Galleries, bookings, contracts, payments and AI — built for wedding vendors who are done juggling six tools.</p>
            <div className="sl-hero-btns">
              <button type="button" className="sl-cta" onClick={goSignup}>{open ? 'Choose your plan' : 'Opening soon'}</button>
              <a href="#features" className="sl-ghost lg">See features</a>
            </div>
            <p className="sl-hero-trust">No card required · Live the same day · Cancel anytime</p>
          </div>

          <div className="sl-hero-stage" aria-hidden="true">
            <div className="sl-scene">
              <div className="sl-dash">
                <div className="sl-dash-top">
                  <span className="sl-dash-dot r" /><span className="sl-dash-dot y" /><span className="sl-dash-dot g" />
                  <div className="sl-dash-title">Studio dashboard</div>
                </div>
                <div className="sl-dash-body">
                  <div className="sl-dash-side">
                    <div className="sl-dash-nav on">Overview</div>
                    <div className="sl-dash-nav">Leads</div>
                    <div className="sl-dash-nav">Bookings</div>
                    <div className="sl-dash-nav">Galleries</div>
                    <div className="sl-dash-nav">Contracts</div>
                  </div>
                  <div className="sl-dash-main">
                    <div className="sl-dash-rev">
                      <div className="sl-dash-rev-lbl">Revenue this season · demo</div>
                      <div className="sl-dash-rev-num">${revenue.toLocaleString()}</div>
                      <div className="sl-dash-bars">
                        {[42, 58, 40, 72, 64, 88, 76].map((h, i) => (
                          <span key={i} style={{ height: `${h}%`, animationDelay: `${0.35 + i * 0.07}s` }} />
                        ))}
                      </div>
                    </div>
                    <div className="sl-dash-cards">
                      <div className="sl-dash-mini"><div className="sl-mini-k">Bookings</div><div className="sl-mini-v">18</div></div>
                      <div className="sl-dash-mini"><div className="sl-mini-k">New leads</div><div className="sl-mini-v">7</div></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="sl-float f1"><b>Payment received</b><i>Deposit · $1,200</i></div>
              <div className="sl-float f2"><b>Gallery delivered</b><i>Sharma wedding</i></div>
              <div className="sl-float f3"><b>Contract signed</b><i>June 14 booked</i></div>
            </div>
          </div>
        </div>
      </header>

      {/* Features — all ten, tight mosaic */}
      <section className="sl-section" id="features">
        <Reveal className="sl-head">
          <h2>Everything your studio needs.</h2>
          <p className="sl-sub">One platform from first inquiry to final gallery — no tool-juggling.</p>
        </Reveal>
        <div className="sl-feat-grid">
          {FEATURES.map((f) => (
            <article key={f.id} className="sl-feat">
              <FeatVisual id={f.id} />
              <div className="sl-feat-body">
                <h3>{f.name}</h3>
                <p>{f.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Industries — compact craft chips */}
      <section className="sl-section sl-ind-band" id="industries">
        <Reveal className="sl-head">
          <h2>Made for every wedding vendor.</h2>
          <p className="sl-sub">Whatever your craft, iwopo shapes around how you actually work.</p>
        </Reveal>
        <div className="sl-ind-grid">
          {INDUSTRIES.map(([ic, name]) => (
            <div key={name} className="sl-ind">
              <span className="sl-ind-ic" aria-hidden="true">{ic}</span>
              <span className="sl-ind-name">{name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing — packages then compact à la carte */}
      <section className="sl-section sl-price-band" id="packages">
        <Reveal className="sl-head">
          <h2>Simple plans. Start free.</h2>
          <p className="sl-sub">Every plan side by side. Start free, move up when you need more.</p>
          <div className="sl-toggle" role="group" aria-label="Billing cycle">
            <button type="button" className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
            <button type="button" className={cycle === 'annual' ? 'on' : ''} onClick={() => setCycle('annual')}>Annual <span className="save">Save</span></button>
          </div>
        </Reveal>

        <PlanTable plans={realPkgs} groups={compare} notes={compareNotes} priceOf={priceOf} open={open} onChoose={(p) => choosePlan(p, 'package')} />

      </section>

      {/* Proof + FAQ side by side on wide screens */}
      <section className="sl-section" id="proof">
        <div className="sl-split">
          {/* Testimonials removed until real, attributable ones exist (design review 2026-11-01): initials-only
              quotes read as invented on a pre-launch site. */}
          <Reveal className="sl-faq-block" id="faq">
            <h2>Quick answers</h2>
            <div className="sl-faq">
              {FAQ.map(([q, a], i) => (
                <div key={q} className={`sl-faq-item ${faqOpen === i ? 'open' : ''}`}>
                  <button type="button" className="sl-faq-q" onClick={() => setFaqOpen(faqOpen === i ? -1 : i)}>
                    {q}<span className="sl-faq-plus">{faqOpen === i ? '−' : '+'}</span>
                  </button>
                  <div className="sl-faq-a"><p>{a}</p></div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Signup — the close */}
      <section className="sl-signup" id="signup">
        <div className="sl-signup-inner">
          <Reveal className="sl-signup-copy">
            <p className="sl-brand-mark light">iwopo</p>
            <h2>{open ? 'Start free. Be live today.' : 'Opening very soon.'}</h2>
            <p>{open ? 'Bring galleries, clients and bookings into one calm place. No card needed.' : 'We’re putting the finishing touches on iwopo. New studios can join very soon.'}</p>
          </Reveal>
          <Reveal className="sl-signup-box">
            {!open ? (
              <>
                <h3>Opening very soon</h3>
                <p className="sl-signup-sub">We’re finishing up and will open iwopo to new studios very soon. Want to hear the moment we do?</p>
                <a className="sl-cta full" href="mailto:info@iwopo.com?subject=Tell%20me%20when%20iwopo%20opens">Tell me when you open</a>
                <div className="sl-login-row">Already have an account? <button type="button" onClick={onGoLogin}>Log in</button></div>
              </>
            ) : (
              <>
                <h3>Ready when you are</h3>
                <p className="sl-signup-sub">Pick the plan that fits — Essential and Pro start with a free trial, no card needed.</p>
                <button type="button" className="sl-cta full" onClick={goPackages}>Choose your plan</button>
                <div className="sl-login-row">Already have an account? <button type="button" onClick={onGoLogin}>Log in</button></div>
              </>
            )}
          </Reveal>
        </div>
      </section>

      <footer className="sl-foot">
        <div className="sl-foot-top">
          <div className="sl-foot-brand">
            <div className="sl-logo">
              <img src="/iwopo-mark.png" alt="" className="sl-logo-img" />
              <span className="sl-logo-word">iwopo</span>
            </div>
            <p>The operating system for wedding professionals.</p>
          </div>
          <div className="sl-foot-cols">
            <a href="#features">Features</a>
            <a href="#packages">Pricing</a>
            <a href="#industries">Solutions</a>
            <a href="#faq">FAQ</a>
            <button type="button" onClick={goSignup}>{open ? 'Choose your plan' : 'Opening soon'}</button>
            <button type="button" onClick={onGoLogin}>Log in</button>
            <a href="mailto:sales@iwopo.com">sales@iwopo.com</a>
          </div>
        </div>
        <div className="sl-foot-bottom">
          <span>{'© '}{new Date().getFullYear()} IWOPO, LLC · 3 Germay Dr, Unit 4 #3327, Wilmington, DE 19804</span>
          <span className="sl-foot-legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refund-policy">Refunds</a><a href="/cookies">Cookies</a></span>
        </div>
      </footer>
    </div>
  );
}
