import { useState, useEffect, useRef } from 'react';
import { api, setSession } from '../lib/api';
import './selling.css';

/* reveal-on-scroll */
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('in'); io.unobserve(el); } },
      { threshold: 0.15 }
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

/* count-up number for the hero revenue figure */
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

const FEATURES = [
  { icon: '🖼️', name: 'Gallery management', desc: 'Private, watermarked galleries clients love — face search, favorites, one-click downloads.' },
  { icon: '📥', name: 'Lead management', desc: 'Every inquiry captured, qualified, and tracked from first message to signed booking.' },
  { icon: '📅', name: 'Bookings & calendar', desc: 'See every event, hold, and deadline in one calendar built around wedding season.' },
  { icon: '📄', name: 'Contracts', desc: 'Send, e-sign, and store agreements with a signing certificate on every one.' },
  { icon: '🧾', name: 'Invoices & payments', desc: 'Deposits, balances, and payment records — always know who owes what.' },
  { icon: '👥', name: 'Crew management', desc: 'Assign shooters, editors, and assistants to events and keep everyone in sync.' },
  { icon: '☁️', name: 'Cloud storage', desc: 'Room for raw footage and full-resolution galleries, scaling as you grow.' },
  { icon: '🎬', name: 'Video uploads', desc: 'Deliver films and highlight reels alongside photos in the same gallery.' },
  { icon: '📤', name: 'Large file transfer', desc: 'Move multi-gigabyte deliveries without wrestling with third-party tools.' },
  { icon: '🤖', name: 'AI assistant', desc: 'Answers inquiries, qualifies leads, and books meetings around the clock.' },
];

const INDUSTRIES = [
  ['📷', 'Photographers'], ['🎥', 'Videographers'], ['🎧', 'DJs'], ['🎉', 'Planners'],
  ['🌸', 'Florists'], ['🏛️', 'Venues'], ['✨', 'Decorators'], ['🎸', 'Live bands'],
  ['💄', 'Makeup artists'], ['💇', 'Hair stylists'], ['🎂', 'Cake designers'], ['🚗', 'Transportation'],
];

const STEPS = [
  { n: '01', t: 'Create your studio', d: 'Sign up, add your brand, and your workspace is ready in minutes — no setup call, no onboarding fee.' },
  { n: '02', t: 'Bring in your clients', d: 'Import contacts, spin up galleries, and send your first contract the same day.' },
  { n: '03', t: 'Grow your business', d: 'Let leads, bookings, payments, and the AI assistant run quietly while you shoot.' },
];

const FAQ = [
  ['Is there really a free trial?', 'Yes. Start on a trial with no card required. When it ends you simply choose a plan to keep going — nothing is charged automatically.'],
  ['Do I have to buy the whole platform?', 'No. Take a full package, or add just the pieces you need — galleries, the vendor suite, cloud storage, or the AI assistant — and add more anytime.'],
  ['Will my galleries be private?', 'Every gallery is private by default, with watermarking, download controls, and per-client access. Your clients only see what you share.'],
  ['Can my whole team use it?', 'Crew management lets you assign shooters, editors, and assistants to events so everyone works from the same schedule.'],
  ['What happens to my files if I leave?', "They're yours. You can download your galleries and records at any time — there's no lock-in on your work."],
];

export default function Selling({ onSignup, onGoLogin }) {
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [cycle, setCycle] = useState('monthly');
  const [form, setForm] = useState({ businessName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [trialOk, setTrialOk] = useState(true);
  const [chosen, setChosen] = useState(null);
  const [faqOpen, setFaqOpen] = useState(0);
  const [heroSeen, setHeroSeen] = useState(false);
  const heroRef = useRef(null);
  const revenue = useCountUp(48250, heroSeen);

  useEffect(() => {
    api.services().then(d => setServices(d.services || [])).catch(() => {});
    api.packages().then(d => setPackages(d.packages || [])).catch(() => {});
    api.trialEligible().then(d => setTrialOk(d.eligible)).catch(() => {});
    const t = setTimeout(() => setHeroSeen(true), 250);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function onMove(e) {
      const el = heroRef.current;
      if (!el) return;
      const x = (e.clientX / window.innerWidth - 0.5);
      const y = (e.clientY / window.innerHeight - 0.5);
      el.style.setProperty('--px', `${x * 18}px`);
      el.style.setProperty('--py', `${y * 18}px`);
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function goSignup() { document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth' }); }
  function goPackages() { document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth' }); }
  function choosePlan(item, kind) { setChosen({ ...item, kind, cycle }); goSignup(); }

  async function handleSignup() {
    setError('');
    if (!form.businessName || !form.email || !form.password) { setError('Please fill in all fields'); return; }
    setLoading(true);
    try {
      const { token, user } = await api.signup(form.businessName, form.email, form.password);
      setSession(token, user);
      onSignup(user);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const standalone = services.filter(s => Number(s.price) > 0);
  const realPkgs = packages.filter(p => p.price_monthly != null);
  const priceOf = (p) => cycle === 'annual'
    ? { big: Math.round(Number(p.price_annual)), unit: '/yr', sub: p.price_annual_regular ? `reg. $${Math.round(Number(p.price_annual_regular))}` : null }
    : { big: Number(p.price_monthly).toFixed(2).replace(/\.00$/, ''), unit: '/mo', sub: null };

  return (
    <div className="sl">
      {/* NAV */}
      <nav className="sl-nav">
        <div className="sl-nav-inner">
          <div className="sl-logo"><img src="/iwopo-logo.png" alt="iwopo" className="sl-logo-img" /></div>
          <div className="sl-nav-links">
            <a href="#features">Features</a>
            <a href="#packages">Pricing</a>
            <a href="#industries">Solutions</a>
            <a href="#faq">Resources</a>
          </div>
          <div className="sl-nav-actions">
            <button className="sl-ghost" onClick={onGoLogin}>Log in</button>
            <button className="sl-cta-sm" onClick={goSignup}>Start free trial</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="sl-hero" ref={heroRef}>
        <div className="sl-hero-aura" />
        <div className="sl-hero-grid">
          <div className="sl-hero-copy">
            <div className="sl-eyebrow"><span className="sl-dot" /> The wedding-vendor operating system</div>
            <h1>Run your entire wedding business in <em>one place.</em></h1>
            <p className="sl-lede">Galleries, bookings, contracts, calendars, payments, crew, cloud storage and an AI assistant — every part of your studio, on one calm platform built for wedding professionals.</p>
            <div className="sl-hero-btns">
              <button className="sl-cta" onClick={goSignup}>Start free trial</button>
              <button className="sl-ghost lg" onClick={goPackages}>See pricing</button>
            </div>
            <div className="sl-hero-trust">
              <div className="sl-stars">★★★★★</div>
              <span>Trusted by wedding professionals across every craft.</span>
            </div>
          </div>

          <div className="sl-hero-stage">
            <div className="sl-dash">
              <div className="sl-dash-top">
                <span className="sl-dash-dot r" /><span className="sl-dash-dot y" /><span className="sl-dash-dot g" />
                <div className="sl-dash-title">Studio dashboard</div>
              </div>
              <div className="sl-dash-body">
                <div className="sl-dash-side">
                  <div className="sl-dash-nav on">📊 Overview</div>
                  <div className="sl-dash-nav">📥 Leads</div>
                  <div className="sl-dash-nav">📅 Bookings</div>
                  <div className="sl-dash-nav">🖼️ Galleries</div>
                  <div className="sl-dash-nav">📄 Contracts</div>
                </div>
                <div className="sl-dash-main">
                  <div className="sl-dash-rev">
                    <div className="sl-dash-rev-lbl">Revenue this season</div>
                    <div className="sl-dash-rev-num">${revenue.toLocaleString()}</div>
                    <div className="sl-dash-bars">
                      {[42, 58, 40, 72, 64, 88, 76].map((h, i) => (
                        <span key={i} style={{ height: `${h}%`, animationDelay: `${0.4 + i * 0.08}s` }} />
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
            <div className="sl-note n1"><span>💳</span><div><b>Payment received</b><i>Deposit · $1,200</i></div></div>
            <div className="sl-note n2"><span>🖼️</span><div><b>Gallery delivered</b><i>Sharma wedding</i></div></div>
            <div className="sl-note n3"><span>📄</span><div><b>Contract signed</b><i>Booked for June 14</i></div></div>
            <div className="sl-note n4"><span>🤖</span><div><b>AI replied</b><i>New inquiry answered</i></div></div>
          </div>
        </div>
      </header>

      {/* TRUST STRIP */}
      <section className="sl-strip">
        <div className="sl-strip-lbl">Built for every craft in the wedding day</div>
        <div className="sl-strip-track">
          {[...INDUSTRIES, ...INDUSTRIES].map(([ic, name], i) => (
            <div className="sl-strip-item" key={i}><span>{ic}</span>{name}</div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="sl-section" id="features">
        <Reveal className="sl-head">
          <div className="sl-eyebrow center"><span className="sl-dot" /> Everything your studio needs</div>
          <h2>One platform. Every part of the business.</h2>
          <p className="sl-sub">Stop stitching together six tools. iwopo runs the whole operation — from first inquiry to final gallery.</p>
        </Reveal>
        <div className="sl-feat-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={f.name} className="sl-feat" style={{ transitionDelay: `${(i % 3) * 80}ms` }}>
              <div className="sl-feat-ic">{f.icon}</div>
              <h3>{f.name}</h3>
              <p>{f.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* DASHBOARD SHOWCASE */}
      <section className="sl-showcase">
        <div className="sl-showcase-grid">
          <Reveal className="sl-showcase-copy">
            <div className="sl-eyebrow"><span className="sl-dot" /> One dashboard</div>
            <h2>Manage everything from a single screen.</h2>
            <p className="sl-sub">No tab-juggling. Galleries, leads, bookings, contracts, payments, crew, and cloud all live together — so nothing slips through during peak season.</p>
            <ul className="sl-check">
              {['Online galleries', 'Leads & bookings', 'Contracts & e-sign', 'Calendar', 'Payments', 'AI assistant', 'Crew', 'Cloud storage'].map(x => (
                <li key={x}><span className="sl-tick">✓</span>{x}</li>
              ))}
            </ul>
            <button className="sl-cta" onClick={goSignup}>Start free trial</button>
          </Reveal>
          <Reveal className="sl-showcase-visual">
            <div className="sl-mac">
              <div className="sl-mac-bar"><span /><span /><span /></div>
              <div className="sl-mac-screen">
                <div className="sl-mac-row">
                  <div className="sl-mac-tile tall"><div className="sl-mac-h">Galleries</div><div className="sl-mac-thumbs"><i /><i /><i /><i /><i /><i /></div></div>
                  <div className="sl-mac-tile"><div className="sl-mac-h">Next booking</div><div className="sl-mac-big">June 14</div><div className="sl-mac-mut">Sharma · Reception</div></div>
                </div>
                <div className="sl-mac-row">
                  <div className="sl-mac-tile"><div className="sl-mac-h">Balance due</div><div className="sl-mac-big">$3,400</div><div className="sl-mac-mut">across 4 clients</div></div>
                  <div className="sl-mac-tile"><div className="sl-mac-h">Leads</div><div className="sl-mac-big">7 new</div><div className="sl-mac-mut">2 replied by AI</div></div>
                </div>
              </div>
            </div>
            <div className="sl-note s1"><span>🧾</span><div><b>Invoice paid</b><i>$1,200</i></div></div>
            <div className="sl-note s2"><span>📥</span><div><b>New inquiry</b><i>Auto-qualified</i></div></div>
          </Reveal>
        </div>
      </section>

      {/* PRICING */}
      <section className="sl-section" id="packages">
        <Reveal className="sl-head">
          <div className="sl-eyebrow center"><span className="sl-dot" /> Pricing</div>
          <h2>Plans that fit how you work.</h2>
          <p className="sl-sub">Take a full package or build your own from the services below.</p>
          <div className="sl-toggle">
            <button className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
            <button className={cycle === 'annual' ? 'on' : ''} onClick={() => setCycle('annual')}>Annual <span className="save">Save</span></button>
          </div>
        </Reveal>

        <div className="sl-pkg-grid">
          {realPkgs.map((p, i) => {
            const pr = priceOf(p);
            const feat = i === 1 || (realPkgs.length < 2 && i === 0);
            return (
              <Reveal key={p.id} className="sl-pkg-wrap" style={{ transitionDelay: `${i * 90}ms` }}>
                <div className={`sl-pkg ${feat ? 'feat' : ''}`}>
                  {feat && <div className="sl-ribbon">Most popular</div>}
                  <div className="sl-pkg-icon">{p.icon}</div>
                  <h3>{p.name}</h3>
                  <div className="sl-pkg-tag">{p.tagline}</div>
                  <div className="sl-price">
                    <span className="cur">$</span><span className="big">{pr.big}</span><span className="unit">{pr.unit}</span>
                  </div>
                  {pr.sub && <div className="sl-price-sub">{pr.sub}</div>}
                  <ul className="sl-incl">
                    {(p.included || []).map(f => (
                      <li key={f.id}><span className="ic">{f.icon}</span>{f.name}{f.detail ? <em> · {f.detail}</em> : ''}</li>
                    ))}
                  </ul>
                  {(p.addons || []).length > 0 && (
                    <div className="sl-addons">
                      <div className="sl-addons-lbl">Optional add-ons</div>
                      {p.addons.map(a => (
                        <div key={a.id} className="sl-addon-row"><span>{a.icon} {a.name}</span><span className="sl-addon-price">+${a.price_monthly}/mo</span></div>
                      ))}
                    </div>
                  )}
                  <button className={`sl-pick ${feat ? 'solid' : ''}`} onClick={() => choosePlan(p, 'package')}>Choose {p.name}</button>
                  {p.trial_days > 0 && <div className="sl-trial">🎁 {p.trial_days}-day free trial</div>}
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* STANDALONE SERVICES */}
      <section className="sl-section alt" id="services">
        <Reveal className="sl-head">
          <div className="sl-eyebrow center"><span className="sl-dot" /> À la carte</div>
          <h2>Or take just what you need.</h2>
          <p className="sl-sub">Every service stands on its own. Start with one, add more anytime.</p>
        </Reveal>
        <div className="sl-svc-grid">
          {standalone.map((s, i) => (
            <Reveal key={s.id} className="sl-svc-wrap" style={{ transitionDelay: `${(i % 4) * 70}ms` }}>
              <div className="sl-svc" onClick={() => choosePlan(s, 'service')}>
                <div className="sl-svc-top">
                  <span className="sl-svc-icon">{s.icon}</span>
                  {s.is_addon && <span className="sl-badge">Add-on</span>}
                </div>
                <div className="sl-svc-name">{s.name}</div>
                <div className="sl-svc-price">{s.tiers ? 'from ' : ''}${s.price}<em>/mo</em></div>
                {s.tiers && (
                  <div className="sl-tiers">
                    {s.tiers.map(t => (
                      <div key={t.label} className="sl-tier-row"><span>{t.label}</span><span>${t.price}/mo</span></div>
                    ))}
                  </div>
                )}
                <div className="sl-svc-add">Add →</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="sl-section">
        <Reveal className="sl-head">
          <div className="sl-eyebrow center"><span className="sl-dot" /> How it works</div>
          <h2>Up and running the same day.</h2>
        </Reveal>
        <div className="sl-steps">
          <div className="sl-steps-line" />
          {STEPS.map((s, i) => (
            <Reveal key={s.n} className="sl-step" style={{ transitionDelay: `${i * 120}ms` }}>
              <div className="sl-step-n">{s.n}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* INDUSTRIES */}
      <section className="sl-section alt" id="industries">
        <Reveal className="sl-head">
          <div className="sl-eyebrow center"><span className="sl-dot" /> Solutions</div>
          <h2>Made for every wedding vendor.</h2>
          <p className="sl-sub">Whatever your craft, iwopo shapes around how you actually work.</p>
        </Reveal>
        <div className="sl-ind-grid">
          {INDUSTRIES.map(([ic, name], i) => (
            <Reveal key={name} className="sl-ind" style={{ transitionDelay: `${(i % 6) * 60}ms` }}>
              <span className="sl-ind-ic">{ic}</span>
              <div className="sl-ind-name">{name}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* AI SECTION */}
      <section className="sl-ai">
        <div className="sl-ai-inner">
          <Reveal className="sl-ai-copy">
            <div className="sl-eyebrow light"><span className="sl-dot light" /> AI assistant</div>
            <h2>Your assistant never sleeps.</h2>
            <p>While you're shooting a ceremony, iwopo's assistant is answering inquiries, qualifying leads, and offering meeting times — so no couple waits for a reply.</p>
            <ul className="sl-ai-list">
              {['Replies to inquiries instantly', 'Qualifies and tags new leads', 'Answers common questions', 'Offers and books meeting times', 'Works around the clock, 24/7'].map(x => (
                <li key={x}><span className="sl-tick light">✓</span>{x}</li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="sl-ai-chat">
            <div className="sl-chat">
              <div className="sl-chat-head"><span className="sl-chat-av">🤖</span> Studio assistant</div>
              <div className="sl-chat-msgs">
                <div className="sl-msg them">Hi! Are you available for a wedding on June 14th?</div>
                <div className="sl-msg me">We are! For June 14th we have two collections that fit a reception that size. Want me to hold the date while you decide?</div>
                <div className="sl-msg them">Yes please — and can you send pricing?</div>
                <div className="sl-msg me">Done — date held for 48 hours and pricing is on its way. Shall I book a quick call tomorrow?</div>
              </div>
              <div className="sl-chat-typing"><span /><span /><span /></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="sl-section">
        <Reveal className="sl-head">
          <div className="sl-eyebrow center"><span className="sl-dot" /> Loved by studios</div>
          <h2>Wedding pros run calmer seasons on iwopo.</h2>
        </Reveal>
        <div className="sl-quotes">
          {[
            { q: 'I replaced four subscriptions with iwopo. Galleries, contracts, and payments finally live in one place — my clients think I hired an office.', n: 'Aria M.', r: 'Wedding Photographer', a: '📷' },
            { q: 'Leads used to sit in my inbox for days during season. Now the assistant replies in seconds and I walk into every call already booked.', n: 'Devon R.', r: 'Wedding DJ', a: '🎧' },
            { q: 'Delivering films and galleries from the same link changed how couples talk about us. It just feels expensive — in the best way.', n: 'Priya & Co.', r: 'Videography Studio', a: '🎥' },
          ].map((t, i) => (
            <Reveal key={t.n} className="sl-quote" style={{ transitionDelay: `${i * 100}ms` }}>
              <div className="sl-quote-stars">★★★★★</div>
              <p>“{t.q}”</p>
              <div className="sl-quote-by"><span className="sl-quote-av">{t.a}</span><div><b>{t.n}</b><i>{t.r}</i></div></div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="sl-section alt" id="faq">
        <Reveal className="sl-head">
          <div className="sl-eyebrow center"><span className="sl-dot" /> Questions</div>
          <h2>Everything you might be wondering.</h2>
        </Reveal>
        <div className="sl-faq">
          {FAQ.map(([q, a], i) => (
            <Reveal key={q} className={`sl-faq-item ${faqOpen === i ? 'open' : ''}`}>
              <button className="sl-faq-q" onClick={() => setFaqOpen(faqOpen === i ? -1 : i)}>
                {q}<span className="sl-faq-plus">{faqOpen === i ? '−' : '+'}</span>
              </button>
              <div className="sl-faq-a"><p>{a}</p></div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="sl-final">
        <div className="sl-final-aura" />
        <Reveal className="sl-final-inner">
          <h2>Ready to grow your wedding business?</h2>
          <p>Start free today — bring your galleries, clients, and bookings into one calm place.</p>
          <div className="sl-final-btns">
            <button className="sl-cta light" onClick={goSignup}>Start free trial</button>
            <button className="sl-ghost onlight" onClick={goPackages}>See pricing</button>
          </div>
        </Reveal>
      </section>

      {/* SIGNUP */}
      <section className="sl-section signup" id="signup">
        <Reveal className="sl-signup-box">
          {chosen && (
            <div className="sl-chosen">
              Selected: <b>{chosen.icon} {chosen.name}</b>
              <span> · {chosen.kind === 'package' ? (cycle === 'annual' ? 'annual' : 'monthly') : `$${chosen.price}/mo`}</span>
              <button className="sl-clear" onClick={() => setChosen(null)}>change</button>
            </div>
          )}
          {trialOk ? (
            <>
              <h2>Start your free trial 🎁</h2>
              <p className="sl-signup-sub">No card needed. Cancel anytime.</p>
              <label>Business name</label>
              <input value={form.businessName} onChange={e => set('businessName', e.target.value)} placeholder="Perfect Poses Media" />
              <label>Email</label>
              <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@studio.com" />
              <label>Password</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSignup()} placeholder="••••••••" />
              {error && <div className="sl-err">⚠️ {error}</div>}
              <button className="sl-cta full" onClick={handleSignup} disabled={loading}>
                {loading ? 'Creating…' : 'Create account'}
              </button>
              <div className="sl-login-row">Already have an account? <span onClick={onGoLogin}>Log in</span></div>
            </>
          ) : (
            <>
              <h2>Free trials used up 🔒</h2>
              <p className="sl-signup-sub">Choose a paid plan to keep going.</p>
              <button className="sl-cta full" onClick={goPackages}>View packages</button>
              <div className="sl-login-row">Have an account? <span onClick={onGoLogin}>Log in</span></div>
            </>
          )}
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer className="sl-foot">
        <div className="sl-foot-top">
          <div className="sl-foot-brand">
            <div className="sl-logo"><img src="/iwopo-logo.png" alt="iwopo" className="sl-logo-img" /></div>
            <p>The operating system for wedding professionals.</p>
          </div>
          <div className="sl-foot-cols">
            <div className="sl-foot-col">
              <h4>Product</h4>
              <a href="#features">Features</a><a href="#packages">Pricing</a><a href="#services">Services</a><a href="#industries">Solutions</a>
            </div>
            <div className="sl-foot-col">
              <h4>Company</h4>
              <a href="#features">About</a><a href="#faq">Resources</a><a href="#packages">Plans</a>
            </div>
            <div className="sl-foot-col">
              <h4>Get started</h4>
              <a onClick={goSignup} role="button">Start free trial</a>
              <a onClick={onGoLogin} role="button">Log in</a>
            </div>
          </div>
        </div>
        <div className="sl-foot-bottom">
          <div className="sl-foot-legalcol">
            <span>© {new Date().getFullYear()} IWOPO, LLC. Built for wedding vendors.</span>
            <span className="sl-foot-addr">3 Germay Dr, Unit 4 #3327, Wilmington, DE 19804, United States</span>
            <a className="sl-foot-mail" href="mailto:sales@iwopo.com">sales@iwopo.com</a>
          </div>
          <span className="sl-foot-legal"><a href="#faq">Privacy</a><a href="#faq">Terms</a></span>
        </div>
      </footer>
    </div>
  );
}
