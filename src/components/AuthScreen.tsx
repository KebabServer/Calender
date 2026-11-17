import { useState } from 'react'
import { ArrowRight, BookOpenText, CalendarDays, LockKeyhole, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'

export function AuthScreen() {
  const [mode, setMode] = useState<'login'|'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setError(''); setMessage('')
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href.split('#')[0] } })
        if (error) throw error
        if (!data.session) setMessage('Check your inbox for a confirmation link. Then return here and sign in.')
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(false) }
  }
  return <div className="auth-screen"><div className="auth-brand"><span className="brand-mark"><span className="brand-lines">◧</span></span><span className="brand-text">daymark<span className="brand-dot">.</span></span></div><div className="auth-layout"><div className="auth-message"><div className="top-eyebrow"><Sparkles size={14}/> THOUGHTFULLY ORGANIZED</div><h1>A calmer place<br/>for everything<br/><em>on your mind.</em></h1><p>Notes to remember. Days to look forward to. One beautiful space across all your devices.</p><div className="auth-feature"><span><BookOpenText size={19}/></span> Your notes, always with you</div><div className="auth-feature"><span><CalendarDays size={19}/></span> A calendar that feels simple</div><div className="auth-orbit"/></div><div className="auth-card"><div className="auth-card-icon"><LockKeyhole size={22}/></div><div className="panel-kicker">YOUR PRIVATE WORKSPACE</div><h2>{mode === 'login' ? 'Welcome back' : 'Create your space'}</h2><p>{mode === 'login' ? 'Sign in to your notes and calendar.' : 'Set up your account to sync across devices.'}</p><form onSubmit={submit}><label className="field-label">Email address<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></label><label className="field-label">Password<input required minLength={6} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters"/></label>{error && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-success" role="status">{message}</div>}<button className="button primary auth-submit" disabled={busy} type="submit">{busy ? 'Just a moment...' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={17}/></button></form><div className="auth-switch">{mode === 'login' ? 'New to Daymark?' : 'Already have an account?'} <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></div></div></div><div className="auth-bottom">Designed for a little more clarity, every day. ✳</div></div>
}
