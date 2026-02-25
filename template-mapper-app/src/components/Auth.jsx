import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

const NAMES = ['Alexandra Reed','James Okonkwo','Mei Lin Zhang','Samuel Torres','Priya Nair','Oliver Bennett'];

function useTypewriter() {
  const [text, setText] = useState('');
  const s = useRef({ ni: 0, ci: 0, deleting: false, pausing: false });
  useEffect(() => {
    let t;
    function step() {
      const r = s.current;
      const target = NAMES[r.ni];
      if (r.pausing) { r.pausing = false; t = setTimeout(step, 1800); return; }
      if (!r.deleting) {
        setText(target.slice(0, r.ci)); r.ci++;
        if (r.ci > target.length) { r.pausing = true; r.deleting = true; t = setTimeout(step, 2000); }
        else t = setTimeout(step, 65);
      } else {
        if (r.ci > 0) { r.ci--; setText(target.slice(0, r.ci)); t = setTimeout(step, 38); }
        else { r.deleting = false; r.ni = (r.ni + 1) % NAMES.length; t = setTimeout(step, 400); }
      }
    }
    t = setTimeout(step, 1000);
    return () => clearTimeout(t);
  }, []);
  return text;
}

function pwStrength(val) {
  let s = 0;
  if (val.length >= 8) s++;
  if (/[A-Z]/.test(val)) s++;
  if (/[0-9]/.test(val)) s++;
  if (/[^A-Za-z0-9]/.test(val)) s++;
  return { score: s, cls: s <= 1 ? 'weak' : s === 2 ? 'ok' : 'good', label: ['','Weak','Fair','Good','Strong'][s] };
}

export default function Auth() {
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const certName = useTypewriter();
  const isSignup = mode === 'signup';
  const strength = pwStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (isSignup && password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      if (!isSignup) {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
      } else {
        const { error } = await signUp(email, password);
        if (error) { setError(error.message); }
        else { setMessage('Account created! Check your email for a confirmation link, then sign in.'); setMode('login'); }
      }
    } catch (err) {
      setError(err?.message ?? 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m) => { setMode(m); setError(''); setMessage(''); setPassword(''); setConfirmPassword(''); };

  const FLOAT_CARDS = [
    { cls: 'c1', pre: 'Certificate of Excellence',    title: ['Advanced Web', 'Development'],    name: 'Sarah Johnson' },
    { cls: 'c2', pre: 'Certificate of Completion',    title: ['Data Science', 'Fundamentals'],   name: 'Marcus Chen' },
    { cls: 'c3', pre: 'Award of Achievement',         title: ['Project', 'Management Pro'],      name: 'Amira Osei' },
    { cls: 'c4', pre: 'Certificate of Participation', title: ['UX Design', 'Workshop 2024'],     name: 'Lena Müller' },
    { cls: 'c5', pre: 'Certificate of Merit',         title: ['Machine', 'Learning Mastery'],    name: 'Tomás Rivera' },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="ap-page">
        {/* Full-page background */}
        <div className="ap-bg" />

        {/* Corner ornaments — all four corners */}
        <div className="ap-corner ap-corner-tl">
          <svg viewBox="0 0 80 80" fill="none"><path d="M4 4 L4 28 M4 4 L28 4" stroke="rgba(184,137,42,0.6)" strokeWidth="1.5"/><path d="M12 12 L12 22 M12 12 L22 12" stroke="rgba(184,137,42,0.3)" strokeWidth="0.75"/><circle cx="4" cy="4" r="2" fill="rgba(184,137,42,0.6)"/></svg>
        </div>
        <div className="ap-corner ap-corner-tr">
          <svg viewBox="0 0 80 80" fill="none"><path d="M4 4 L4 28 M4 4 L28 4" stroke="rgba(184,137,42,0.6)" strokeWidth="1.5"/><path d="M12 12 L12 22 M12 12 L22 12" stroke="rgba(184,137,42,0.3)" strokeWidth="0.75"/><circle cx="4" cy="4" r="2" fill="rgba(184,137,42,0.6)"/></svg>
        </div>
        <div className="ap-corner ap-corner-bl">
          <svg viewBox="0 0 80 80" fill="none"><path d="M4 4 L4 28 M4 4 L28 4" stroke="rgba(184,137,42,0.6)" strokeWidth="1.5"/><path d="M12 12 L12 22 M12 12 L22 12" stroke="rgba(184,137,42,0.3)" strokeWidth="0.75"/><circle cx="4" cy="4" r="2" fill="rgba(184,137,42,0.6)"/></svg>
        </div>
        <div className="ap-corner ap-corner-br">
          <svg viewBox="0 0 80 80" fill="none"><path d="M4 4 L4 28 M4 4 L28 4" stroke="rgba(184,137,42,0.6)" strokeWidth="1.5"/><path d="M12 12 L12 22 M12 12 L22 12" stroke="rgba(184,137,42,0.3)" strokeWidth="0.75"/><circle cx="4" cy="4" r="2" fill="rgba(184,137,42,0.6)"/></svg>
        </div>

        {/* Floating cert cards — spread across full page */}
        <div className="ap-float-bg">
          {FLOAT_CARDS.map(({ cls, pre, title, name }) => (
            <div key={cls} className={`ap-fc ap-fc-${cls}`}>
              <div className="ap-fc-inner">
                <div className="ap-fc-pre">{pre}</div>
                <div className="ap-fc-title">{title[0]}<br/>{title[1]}</div>
                <div className="ap-fc-line" />
                <div className="ap-fc-name">{name}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Brand lockup — bottom left */}
        <div className="ap-brand">
          <div className="ap-brand-mark">CS</div>
          <div className="ap-brand-name">Cert<span>Studio</span></div>
        </div>

        {/* Social proof — bottom right */}
        <div className="ap-social">
          <div className="ap-sp-num">48,000+</div>
          <div className="ap-sp-lbl">certificates generated</div>
        </div>

        {/* ── CENTERED FORM CARD ── */}
        <div className="ap-card">
          {/* Card logo */}
          <div className="ap-card-logo">
            <div className="ap-brand-mark">CS</div>
            <div className="ap-card-logo-name">Cert<span>Studio</span></div>
          </div>

          <div className="ap-form-container">
            {/* Mode toggle */}
            <div className="ap-mode-toggle">
              <button className={`ap-mode-btn${!isSignup ? ' active' : ''}`} onClick={() => switchMode('login')}>Sign in</button>
              <button className={`ap-mode-btn${isSignup ? ' active' : ''}`} onClick={() => switchMode('signup')}>Create account</button>
            </div>

            <div className="ap-eyebrow">{isSignup ? 'Get started free' : 'Welcome back'}</div>
            <div className="ap-form-title">{isSignup ? <>Create your<br/>account</> : <>Sign in to<br/>CertStudio</>}</div>
            <div className="ap-form-sub">{isSignup ? 'Build and send beautiful certificates to your recipients.' : 'Design and generate professional certificates in minutes.'}</div>

            {error   && <div className="ap-alert ap-alert-err">{error}</div>}
            {message && <div className="ap-alert ap-alert-ok">{message}</div>}

            <form onSubmit={handleSubmit}>
              {/* Email */}
              <div className="ap-field">
                <label className="ap-field-lbl">Email address</label>
                <div className="ap-field-wrap">
                  <input className="ap-input" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                  <svg className="ap-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
                </div>
              </div>

              {/* Password */}
              <div className="ap-field">
                <label className="ap-field-lbl">Password</label>
                <div className="ap-field-wrap">
                  <input className="ap-input ap-input-pw" type={showPassword ? 'text' : 'password'} required autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} />
                  <svg className="ap-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  <button type="button" className="ap-pw-toggle" tabIndex={-1} onClick={() => setShowPassword(v => !v)}>
                    {showPassword
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
                {isSignup && password.length > 0 && (
                  <>
                    <div className="ap-pw-bars">
                      {[0,1,2,3].map(i => <div key={i} className={`ap-pw-bar${i < strength.score ? ` ${strength.cls}` : ''}`} />)}
                    </div>
                    <div className="ap-pw-lbl">{strength.label}</div>
                  </>
                )}
              </div>

              {/* Confirm password (signup only) */}
              {isSignup && (
                <div className="ap-field">
                  <label className="ap-field-lbl">Confirm password</label>
                  <div className="ap-field-wrap">
                    <input className={`ap-input ap-input-pw${confirmPassword && confirmPassword !== password ? ' ap-input-err' : ''}`} type={showPassword ? 'text' : 'password'} required autoComplete="new-password" placeholder="Repeat your password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                    <svg className="ap-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  </div>
                </div>
              )}

              {/* Options row (login only) */}
              {!isSignup && (
                <div className="ap-options-row">
                  <label className="ap-remember" onClick={() => setRememberMe(v => !v)}>
                    <div className={`ap-check${rememberMe ? ' on' : ''}`} />
                    Remember me
                  </label>
                  <a href="#" className="ap-forgot">Forgot password?</a>
                </div>
              )}

              {/* Submit */}
              <button type="submit" disabled={loading} className="ap-submit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
                <span>{loading ? (isSignup ? 'Creating account…' : 'Signing in…') : (isSignup ? 'Create Account' : 'Sign In')}</span>
              </button>
            </form>

            {/* Footer */}
            <div className="ap-footer">
              {isSignup
                ? <>Already have an account? <button className="ap-link-btn" onClick={() => switchMode('login')}>Sign in</button></>
                : <>Don't have an account? <button className="ap-link-btn" onClick={() => switchMode('signup')}>Create one free</button></>
              }
            </div>

            <div className="ap-terms">
              By continuing, you agree to our <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Scoped CSS ─── */
const CSS = `
*, *::before, *::after { box-sizing: border-box; }

.ap-page {
  position: relative; height: 100vh; width: 100vw; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Lato', sans-serif;
}

/* Full-page background */
.ap-bg {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 60% 55% at 20% 35%, rgba(184,137,42,0.10) 0%, transparent 65%),
    radial-gradient(ellipse 50% 50% at 80% 65%, rgba(42,91,168,0.07) 0%, transparent 60%),
    radial-gradient(ellipse 70% 70% at 50% 50%, rgba(184,137,42,0.05) 0%, transparent 70%),
    radial-gradient(ellipse 100% 100% at 50% 50%, #1c1710 0%, #0d0c09 100%);
}
.ap-bg::after {
  content: ''; position: absolute; inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  opacity: 0.4;
}

/* Corner ornaments — all 4 corners */
.ap-corner { position: absolute; width: 120px; height: 120px; pointer-events: none; opacity: 0.15; z-index: 1; }
.ap-corner svg { width: 100%; height: 100%; }
.ap-corner-tl { top: 24px;    left: 24px; }
.ap-corner-tr { top: 24px;    right: 24px;  transform: scaleX(-1); }
.ap-corner-bl { bottom: 24px; left: 24px;   transform: scaleY(-1); }
.ap-corner-br { bottom: 24px; right: 24px;  transform: rotate(180deg); }

/* Floating cert cards — spread across full page */
.ap-float-bg { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.ap-fc {
  position: absolute;
  background: linear-gradient(145deg, #fdfbf5 0%, #f5edd8 100%);
  border-radius: 4px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(184,137,42,0.2);
  transform-origin: center;
  animation: apFloatCard linear infinite;
  opacity: 0;
}
.ap-fc::before {
  content: ''; position: absolute; inset: 8px;
  border: 1px solid rgba(184,137,42,0.2); pointer-events: none;
}
/* spread cards around the full viewport, avoiding center */
.ap-fc-c1 { width:190px; height:135px; top:8%;  left:3%;        animation-duration:22s; animation-delay:0s; }
.ap-fc-c2 { width:165px; height:116px; top:60%; left:2%;        animation-duration:28s; animation-delay:-6s; }
.ap-fc-c3 { width:178px; height:126px; top:74%; left:52%;       animation-duration:20s; animation-delay:-10s; }
.ap-fc-c4 { width:172px; height:122px; top:5%;  right:3%;       animation-duration:25s; animation-delay:-3s; }
.ap-fc-c5 { width:152px; height:108px; top:44%; right:2%;       animation-duration:32s; animation-delay:-15s; }
@keyframes apFloatCard {
  0%   { opacity:0; transform:translateY(0px) rotate(-2deg); }
  8%   { opacity:0.5; }
  50%  { opacity:0.42; transform:translateY(-18px) rotate(1deg); }
  92%  { opacity:0.5; }
  100% { opacity:0; transform:translateY(-36px) rotate(-2deg); }
}
.ap-fc-inner { padding:14px; height:100%; display:flex; flex-direction:column; }
.ap-fc-pre  { font-size:6px; letter-spacing:2px; text-transform:uppercase; color:rgba(100,70,20,0.5); margin-bottom:4px; font-weight:700; }
.ap-fc-title{ font-family:'Playfair Display',serif; font-size:13px; color:#2a1a06; line-height:1.3; }
.ap-fc-line { margin-top:auto; width:60%; height:1px; background:rgba(184,137,42,0.3); }
.ap-fc-name { margin-top:6px; font-family:'Playfair Display',serif; font-size:10px; font-style:italic; color:rgba(40,25,8,0.7); }

/* Brand — bottom left */
@keyframes apFadeUp { from{opacity:0;transform:translateY(12px);} to{opacity:1;transform:none;} }
.ap-brand { position:absolute; bottom:28px; left:32px; display:flex; align-items:center; gap:10px; animation:apFadeUp 1s 0.9s both; z-index:2; }
.ap-brand-mark { width:28px; height:28px; border-radius:7px; background:linear-gradient(135deg,#d4a84b 0%,#7a5018 100%); display:flex; align-items:center; justify-content:center; font-family:'Playfair Display',serif; font-size:13px; color:#fff; font-weight:700; flex-shrink:0; }
.ap-brand-name { font-family:'Playfair Display',serif; font-size:15px; color:rgba(255,255,255,0.5); letter-spacing:-0.3px; }
.ap-brand-name span { color:#d4a84b; }

/* Social proof — bottom right */
.ap-social { position:absolute; bottom:28px; right:32px; text-align:right; animation:apFadeUp 1s 1.1s both; z-index:2; }
.ap-sp-num  { font-family:'Playfair Display',serif; font-size:26px; color:rgba(255,255,255,0.75); line-height:1; }
.ap-sp-lbl  { font-size:10px; color:rgba(255,255,255,0.3); letter-spacing:0.5px; margin-top:3px; }

/* ── CENTERED FORM CARD ── */
.ap-card {
  position: relative; z-index: 10;
  width: 100%; max-width: 400px;
  background: #fdfaf4;
  border-radius: 18px;
  padding: 36px 40px 32px;
  box-shadow:
    0 48px 80px rgba(0,0,0,0.55),
    0 16px 40px rgba(0,0,0,0.3),
    0 0 0 1px rgba(184,137,42,0.18);
  animation: apCardIn 0.9s cubic-bezier(0.16,1,0.3,1) both;
  overflow-y: auto;
  max-height: calc(100vh - 80px);
}
@keyframes apCardIn { from{opacity:0;transform:scale(0.94) translateY(20px);} to{opacity:1;transform:none;} }
.ap-card::before {
  content:''; position:absolute; inset:0; border-radius:18px; pointer-events:none;
  background:
    radial-gradient(ellipse 100% 60% at 100% 0%,rgba(240,230,208,0.5) 0%,transparent 60%),
    radial-gradient(ellipse 80% 80% at 0% 100%,rgba(240,230,208,0.25) 0%,transparent 60%);
}

/* Card logo — centered at top */
.ap-card-logo {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  margin-bottom: 28px;
}
.ap-card-logo-name {
  font-family: 'Playfair Display', serif; font-size: 20px;
  color: #1a1208; letter-spacing: -0.3px; font-weight: 700;
}
.ap-card-logo-name span { color: #b8892a; }

/* Form container */
.ap-form-container {
  position: relative; z-index: 1;
  animation: apFormSlide 0.8s 0.25s cubic-bezier(0.16,1,0.3,1) both;
}
@keyframes apFormSlide { from{opacity:0;transform:translateY(10px);} to{opacity:1;transform:none;} }

/* Mode toggle */
.ap-mode-toggle { display:flex; background:#f0eadb; border-radius:10px; padding:3px; margin-bottom:32px; border:1px solid rgba(184,137,42,0.15); }
.ap-mode-btn { flex:1; height:34px; border:none; border-radius:8px; cursor:pointer; font-family:'Lato',sans-serif; font-size:13px; font-weight:700; letter-spacing:0.3px; transition:all 0.2s; background:none; color:rgba(26,18,8,0.3); }
.ap-mode-btn.active { background:#fdfaf4; color:#1a1208; box-shadow:0 1px 6px rgba(0,0,0,0.1),0 0 0 1px rgba(184,137,42,0.2); }

/* Headings */
.ap-eyebrow { font-size:10px; letter-spacing:2.5px; text-transform:uppercase; color:#b8892a; font-weight:700; margin-bottom:6px; }
.ap-form-title { font-family:'Playfair Display',serif; font-size:30px; color:#1a1208; line-height:1.1; margin-bottom:6px; letter-spacing:-0.5px; }
.ap-form-sub { font-size:13px; color:rgba(26,18,8,0.6); margin-bottom:28px; line-height:1.5; }

/* Alerts */
.ap-alert { border-radius:8px; font-size:13px; padding:10px 14px; margin-bottom:16px; line-height:1.4; }
.ap-alert-err { background:rgba(192,57,43,0.08); border:1px solid rgba(192,57,43,0.25); color:#a93226; }
.ap-alert-ok  { background:rgba(26,107,69,0.08);  border:1px solid rgba(26,107,69,0.25);  color:#1a6b45; }

/* Fields */
.ap-field { margin-bottom:14px; }
.ap-field-lbl { display:block; font-size:11px; font-weight:700; letter-spacing:0.5px; color:rgba(26,18,8,0.6); text-transform:uppercase; margin-bottom:6px; }
.ap-field-wrap { position:relative; }
.ap-input {
  width:100%; height:42px; padding:0 14px 0 40px;
  background:#f8f4ec; border:1.5px solid rgba(26,18,8,0.1);
  border-radius:10px; font-family:'Lato',sans-serif;
  font-size:14px; color:#1a1208; outline:none;
  transition:all 0.2s; caret-color:#b8892a;
}
.ap-input:focus { border-color:rgba(184,137,42,0.5); background:#fffdf7; box-shadow:0 0 0 3px rgba(184,137,42,0.1); }
.ap-input::placeholder { color:rgba(26,18,8,0.25); }
.ap-input.ap-input-err { border-color:#c0392b; background:#fff8f8; box-shadow:0 0 0 3px rgba(192,57,43,0.08); }
.ap-input-pw { padding-right:40px; }
.ap-field-icon { position:absolute; left:13px; top:50%; transform:translateY(-50%); color:rgba(26,18,8,0.25); pointer-events:none; transition:color 0.2s; }
.ap-field-wrap:focus-within .ap-field-icon { color:#b8892a; }

/* Password toggle */
.ap-pw-toggle { position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:rgba(26,18,8,0.3); padding:4px; transition:color 0.15s; }
.ap-pw-toggle:hover { color:#1a1208; }

/* Password strength */
.ap-pw-bars { display:flex; gap:4px; margin-top:6px; }
.ap-pw-bar  { flex:1; height:3px; border-radius:2px; background:rgba(26,18,8,0.08); transition:background 0.3s; }
.ap-pw-bar.weak { background:#e74c3c; }
.ap-pw-bar.ok   { background:#e67e22; }
.ap-pw-bar.good { background:#27ae60; }
.ap-pw-lbl { font-size:10px; color:rgba(26,18,8,0.3); margin-top:3px; }

/* Options row */
.ap-options-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; margin-top:4px; }
.ap-remember { display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; color:rgba(26,18,8,0.6); user-select:none; }
.ap-check { width:16px; height:16px; border-radius:4px; background:#f8f4ec; border:1.5px solid rgba(26,18,8,0.2); display:flex; align-items:center; justify-content:center; transition:all 0.15s; flex-shrink:0; }
.ap-check.on { background:#b8892a; border-color:#b8892a; }
.ap-check.on::after { content:''; width:8px; height:5px; border:2px solid #fff; border-top:none; border-right:none; transform:rotate(-45deg) translateY(-1px); display:block; }
.ap-forgot { font-size:12px; color:#b8892a; font-weight:700; text-decoration:none; border-bottom:1px solid transparent; transition:border-color 0.15s; }
.ap-forgot:hover { border-bottom-color:#b8892a; }

/* Submit button */
.ap-submit {
  width:100%; height:44px;
  background:linear-gradient(135deg,#d4a84b 0%,#8a5e14 100%);
  border:none; border-radius:10px; cursor:pointer;
  color:#fff; font-family:'Lato',sans-serif;
  font-size:14px; font-weight:700; letter-spacing:0.4px;
  transition:all 0.25s;
  box-shadow:0 4px 20px rgba(184,137,42,0.35),0 1px 0 rgba(255,255,255,0.15) inset;
  display:flex; align-items:center; justify-content:center; gap:8px;
  position:relative; overflow:hidden; margin-top:2px;
}
.ap-submit::before { content:''; position:absolute; inset:0; background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.12) 50%,transparent 100%); transform:translateX(-100%); transition:transform 0.5s; }
.ap-submit:hover { box-shadow:0 6px 28px rgba(184,137,42,0.5); transform:translateY(-1px); }
.ap-submit:hover::before { transform:translateX(100%); }
.ap-submit:active { transform:translateY(0); }
.ap-submit:disabled { opacity:0.7; pointer-events:none; }

/* Footer */
.ap-footer { text-align:center; margin-top:20px; font-size:12px; color:rgba(26,18,8,0.3); }
.ap-link-btn { background:none; border:none; color:#b8892a; font-weight:700; cursor:pointer; font-size:12px; font-family:'Lato',sans-serif; padding:0; text-decoration:none; }
.ap-link-btn:hover { text-decoration:underline; }
.ap-terms { margin-top:16px; font-size:10.5px; color:rgba(26,18,8,0.25); text-align:center; line-height:1.5; }
.ap-terms a { color:rgba(26,18,8,0.4); }
`;
