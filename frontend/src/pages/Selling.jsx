import { useState, useEffect, useRef } from 'react';
import { api, setSession } from '../lib/api';
import './selling.css';

// reveal-on-scroll
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('in'); io.unobserve(el); } },
      { threshold: 0.18 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, className = '', style }) {
  const ref = useReveal();
  return <div ref={ref} className={`reveal ${className}`} style={style}>{children}</div>;
}

export default function Selling({ onSignup, onGoLogin }) {
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [cycle, setCycle] = useState('monthly');
  const [form, setForm] = useState({ businessName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [trialOk, setTrialOk] = useState(true);
  const [chosen, setChosen] = useState(null);
  const heroRef = useRef(null);

  useEffect(() => {
    api.services().then(d => setServices(d.services || [])).catch(() => {});
    api.packages().then(d => setPackages(d.packages || [])).catch(() => {});
    api.trialEligible().then(d => setTrialOk(d.eligible)).catch(() => {});
  }, []);

  useEffect(() => {
    function onMove(e) {
      const el = heroRef.current;
      if (!el) return;
      const x = (e.clientX / window.innerWidth - 0.5);
      const y = (e.clientY / window.innerHeight - 0.5);
      el.style.setProperty('--px', `${x * 26}px`);
      el.style.setProperty('--py', `${y * 26}px`);
      el.style.setProperty('--rx', `${-y * 6}deg`);
      el.style.setProperty('--ry', `${x * 6}deg`);
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function goSignup() { document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth' }); }

  // payment terminal hook
  function choosePlan(item, kind) { setChosen({ ...item, kind, cycle }); goSignup(); }

  async function handleSignup() {
    setError('');
    if (!form.businessName || !form.email || !form.password) { setError('Please fill in all fields'); return; }
    setLoading(true);
    try {
      const { token, user } = await api.signup(form.businessName, form.email, form.password);
      setSession(token, user);
      // TODO(payment): if chosen, route to checkout for chosen.id + cycle before onSignup
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
        <div className="sl-logo"><span className="hex">⬡</span> Vowflo</div>
        <div className="sl-nav-links">
          <a href="#packages">Packages</a>
          <a href="#services">Services</a>
          <button className="sl-ghost" onClick={onGoLogin}>Log in</button>
          <button className="sl-cta-sm" onClick={goSignup}>Start free</button>
        </div>
      </nav>

      <header className="sl-hero" ref={heroRef}>
        <div className="sl-hero-glow" />
        <div className="sl-hero-copy">
          <div className="sl-eyebrow">The wedding-vendor OS</div>
          <h1>Your whole studio.<br /><em>One calm place.</em></h1>
          <p>Galleries, bookings, contracts, crews, payments — advertised, sold, and run from a single dashboard built for wedding pros.</p>
          <div className="sl-hero-btns">
            <button className="sl-cta" onClick={() => document.getElementById('packages').scrollIntoView({ behavior: 'smooth' })}>See packages</button>
            <button className="sl-ghost lg" onClick={goSignup}>Start free trial →</button>
          </div>
        </div>
        <div className="sl-stage">
          <div className="sl-card float f1"><span>📸</span><b>Galleries</b><i>Private, watermarked, downloadable</i></div>
          <div className="sl-card float f2"><span>📋</span><b>Leads & Bookings</b><i>Inquiry → booked, tracked</i></div>
          <div className="sl-card float f3"><span>📄</span><b>Contracts</b><i>E-sign + certificate</i></div>
          <div className="sl-card float f4"><span>💳</span><b>Payments</b><i>Deposits & balances</i></div>
        </div>
        <div className="sl-scroll-hint">scroll ↓</div>
      </header>

      <section className="sl-section" id="packages">
        <Reveal className="sl-head">
          <div className="sl-eyebrow center">Packages</div>
          <h2>Bundles that just fit.</h2>
          <p>Pick a package or build your own from services below.</p>
          <div className="sl-toggle">
            <button className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
            <button className={cycle === 'annual' ? 'on' : ''} onClick={() => setCycle('annual')}>Annual <span className="save">save</span></button>
          </div>
        </Reveal>

        <div className="sl-pkg-grid">
          {realPkgs.map((p, i) => {
            const pr = priceOf(p);
            const feat = i === 0;
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

      <section className="sl-section alt" id="services">
        <Reveal className="sl-head">
          <div className="sl-eyebrow center">À la carte</div>
          <h2>Or take just what you need.</h2>
          <p>Every service works on its own. Add more anytime.</p>
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
              <button className="sl-cta full" onClick={() => document.getElementById('packages').scrollIntoView({ behavior: 'smooth' })}>View packages</button>
              <div className="sl-login-row">Have an account? <span onClick={onGoLogin}>Log in</span></div>
            </>
          )}
        </Reveal>
      </section>

      <footer className="sl-foot">
        <div className="sl-logo"><span className="hex">⬡</span> Vowflo</div>
        <div className="sl-foot-sub">Built for wedding vendors. © {new Date().getFullYear()}</div>
      </footer>
    </div>
  );
}
