import { useState, useEffect, useRef } from 'react';
import { api, setSession } from '../lib/api';
import PasswordInput from '../components/PasswordInput';
import { PROFESSION_LIST } from '../lib/professions';
import './selling.css';

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
    if (!document.getElementById('sl-fonts')) {
      const l = document.createElement('link');
      l.id = 'sl-fonts'; l.rel = 'stylesheet'; l.href = FONTS_CSS;
      document.head.appendChild(l);
    }
  }, []);

  useEffect(() => {
    api.services().then(d => setServices(d.services || [])).catch(() => {});
    api.packages().then(d => setPackages(d.packages || [])).catch(() => {});
    api.trialEligible().then(d => setTrialOk(d.eligible)).catch(() => {});
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
      <nav className="sl-nav">
        <div className="sl-nav-inner">
          <a href="/" className="sl-logo" aria-label="iwopo home">
            <img src="/iwopo-logo.png" alt="iwopo" className="sl-logo-img" />
            <span className="sl-logo-word">iwopo</span>
          </a>
          <div className="sl-nav-links">
            <a href="#features">Features</a>
            <a href="#packages">Pricing</a>
            <a href="#industries">Solutions</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="sl-nav-actions">
            <button type="button" className="sl-ghost" onClick={onGoLogin}>Log in</button>
            <button type="button" className="sl-cta-sm" onClick={goSignup}>Start free trial</button>
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
              <button type="button" className="sl-cta" onClick={goSignup}>Start free trial</button>
              <button type="button" className="sl-ghost lg" onClick={goPackages}>See pricing</button>
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
                      <div className="sl-dash-rev-lbl">Revenue this season</div>
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
          <p className="sl-sub">Full packages or just the pieces you need.</p>
          <div className="sl-toggle" role="group" aria-label="Billing cycle">
            <button type="button" className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
            <button type="button" className={cycle === 'annual' ? 'on' : ''} onClick={() => setCycle('annual')}>Annual <span className="save">Save</span></button>
          </div>
        </Reveal>

        <div className="sl-pkg-grid">
          {realPkgs.map((p, i) => {
            const pr = priceOf(p);
            const feat = i === 1 || (realPkgs.length < 2 && i === 0);
            return (
              <Reveal key={p.id} className="sl-pkg-wrap" style={{ transitionDelay: `${i * 80}ms` }}>
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
                  <button type="button" className={`sl-pick ${feat ? 'solid' : ''}`} onClick={() => choosePlan(p, 'package')}>
                    Choose {p.name}
                  </button>
                  {p.trial_days > 0 && <div className="sl-trial">{p.trial_days}-day free trial</div>}
                </div>
              </Reveal>
            );
          })}
        </div>

        {standalone.length > 0 && (
          <div className="sl-svc-row">
            <p className="sl-svc-lbl">Or start with one service</p>
            <div className="sl-svc-grid">
              {standalone.map((s, i) => (
                <button type="button" key={s.id} className="sl-svc" style={{ transitionDelay: `${(i % 4) * 50}ms` }}
                  onClick={() => choosePlan(s, 'service')}>
                  <span className="sl-svc-icon">{s.icon}</span>
                  <span className="sl-svc-name">{s.name}</span>
                  <span className="sl-svc-price">{s.tiers ? 'from ' : ''}${s.price}<em>/mo</em></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Proof + FAQ side by side on wide screens */}
      <section className="sl-section" id="proof">
        <div className="sl-split">
          <Reveal className="sl-quotes-block">
            <h2>Studios run calmer seasons on iwopo.</h2>
            <div className="sl-quotes">
              {[
                { q: 'I replaced four subscriptions. Galleries, contracts and payments finally live in one place.', n: 'Aria M.', r: 'Wedding photographer' },
                { q: 'Leads used to sit for days. Now the assistant replies in seconds and I walk into calls already booked.', n: 'Devon R.', r: 'Wedding DJ' },
              ].map((t, i) => (
                <figure key={t.n} className="sl-quote" style={{ transitionDelay: `${i * 90}ms` }}>
                  <blockquote>“{t.q}”</blockquote>
                  <figcaption><b>{t.n}</b> · {t.r}</figcaption>
                </figure>
              ))}
            </div>
          </Reveal>

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
            <h2>Start free. Be live today.</h2>
            <p>Bring galleries, clients and bookings into one calm place. No card needed.</p>
          </Reveal>
          <Reveal className="sl-signup-box">
            {chosen && (
              <div className="sl-chosen">
                Selected: <b>{chosen.icon} {chosen.name}</b>
                <span> · {chosen.kind === 'package' ? (cycle === 'annual' ? 'annual' : 'monthly') : `$${chosen.price}/mo`}</span>
                <button type="button" className="sl-clear" onClick={() => setChosen(null)}>change</button>
              </div>
            )}
            {trialOk ? (
              <>
                <h3>Create your studio</h3>
                <p className="sl-signup-sub">Free trial · cancel anytime</p>
                <label htmlFor="sl-biz">Business name</label>
                <input id="sl-biz" value={form.businessName} onChange={e => set('businessName', e.target.value)} placeholder="Perfect Poses Media" />
                <label htmlFor="sl-email">Email</label>
                <input id="sl-email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@studio.com" />
                <label htmlFor="sl-pass">Password</label>
                <PasswordInput id="sl-pass" value={form.password} onChange={e => set('password', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSignup()} placeholder="••••••••" />
                {error && <div className="sl-err">{error}</div>}
                <button type="button" className="sl-cta full" onClick={handleSignup} disabled={loading}>
                  {loading ? 'Creating…' : 'Create account'}
                </button>
                <div className="sl-login-row">Already have an account? <button type="button" onClick={onGoLogin}>Log in</button></div>
              </>
            ) : (
              <>
                <h3>Free trials used up</h3>
                <p className="sl-signup-sub">Choose a paid plan to keep going.</p>
                <button type="button" className="sl-cta full" onClick={goPackages}>View packages</button>
                <div className="sl-login-row">Have an account? <button type="button" onClick={onGoLogin}>Log in</button></div>
              </>
            )}
          </Reveal>
        </div>
      </section>

      <footer className="sl-foot">
        <div className="sl-foot-top">
          <div className="sl-foot-brand">
            <div className="sl-logo">
              <img src="/iwopo-logo.png" alt="" className="sl-logo-img" />
              <span className="sl-logo-word">iwopo</span>
            </div>
            <p>The operating system for wedding professionals.</p>
          </div>
          <div className="sl-foot-cols">
            <a href="#features">Features</a>
            <a href="#packages">Pricing</a>
            <a href="#industries">Solutions</a>
            <a href="#faq">FAQ</a>
            <button type="button" onClick={goSignup}>Start free trial</button>
            <button type="button" onClick={onGoLogin}>Log in</button>
            <a href="mailto:sales@iwopo.com">sales@iwopo.com</a>
          </div>
        </div>
        <div className="sl-foot-bottom">
          <span>© {new Date().getFullYear()} IWOPO, LLC · 3 Germay Dr, Unit 4 #3327, Wilmington, DE 19804</span>
          <span className="sl-foot-legal"><a href="#faq">Privacy</a><a href="#faq">Terms</a></span>
        </div>
      </footer>
    </div>
  );
}
