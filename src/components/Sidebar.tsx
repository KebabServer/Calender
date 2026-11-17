import { CalendarDays, ChevronRight, Cloud, House, Lightbulb, Moon, NotebookPen, Plus, Settings2, Sun } from 'lucide-react'
import { format } from 'date-fns'
import type { View } from '../types'

type Props = {
  active: View
  onNavigate: (view: View) => void
  onNewNote: () => void
  onNewEvent: () => void
  cloud: boolean
  email?: string
  theme: 'dark' | 'light'
  onTheme: () => void
  onOpenSettings: () => void
}
export function Sidebar({ active, onNavigate, onNewNote, onNewEvent, cloud, email, theme, onTheme, onOpenSettings }: Props) {
  const nav = [
    { id: 'home' as const, icon: House, label: 'Overview' },
    { id: 'notes' as const, icon: NotebookPen, label: 'My notes' },
    { id: 'calendar' as const, icon: CalendarDays, label: 'Calendar' },
  ]
  return <>
    <aside className="sidebar">
      <button className="brand" onClick={() => onNavigate('home')} aria-label="Go to overview">
        <span className="brand-mark"><span className="brand-lines">◧</span></span>
        <span className="brand-text">daymark<span className="brand-dot">.</span></span>
      </button>
      <div className="sidebar-middle">
        <div className="side-section-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {nav.map(({ id, icon: Icon, label }) => <button key={id} className={`side-nav-item ${active === id ? 'active' : ''}`} onClick={() => onNavigate(id)}><Icon size={18} strokeWidth={1.8}/><span>{label}</span>{active === id && <span className="nav-active-dot"/>}</button>)}
        </nav>
        <div className="side-section-label side-tools-label">QUICK CREATE</div>
        <button className="side-tool" onClick={onNewNote}><span className="tool-square purple"><NotebookPen size={16}/></span><span>New note</span><Plus size={15} className="tool-plus"/></button>
        <button className="side-tool" onClick={onNewEvent}><span className="tool-square mint"><CalendarDays size={16}/></span><span>New event</span><Plus size={15} className="tool-plus"/></button>
        <div className="sidebar-note">
          <span className="sidebar-note-icon"><Lightbulb size={18}/></span>
          <strong>A space for your thoughts.</strong>
          <span>Less clutter, more clarity. Take each day as it comes.</span>
        </div>
      </div>
      <div className="sidebar-bottom">
        <button className="sidebar-status" onClick={onOpenSettings}>
          <span className="status-icon"><Cloud size={17}/></span>
          <span className="status-text"><strong>{cloud ? 'Cloud workspace' : 'Demo workspace'}</strong><small>{cloud ? 'Synced with Supabase' : 'Saved in this browser'}</small></span>
          <ChevronRight size={15}/>
        </button>
        <div className="sidebar-foot-row">
          <button className="icon-only" aria-label="Toggle light and dark theme" onClick={onTheme}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
          <span className="foot-date">{format(new Date(), 'EEEE, MMM d')}</span>
          <button className="icon-only" aria-label="Settings" onClick={onOpenSettings}><Settings2 size={18}/></button>
        </div>
        {email && <span className="user-email" title={email}>{email}</span>}
      </div>
    </aside>
    <nav className="mobile-tabbar" aria-label="Mobile navigation">
      {nav.map(({ id, icon: Icon, label }) => <button key={id} className={active === id ? 'active' : ''} onClick={() => onNavigate(id)}><Icon size={21}/><span>{label === 'My notes' ? 'Notes' : label}</span></button>)}
    </nav>
  </>
}
