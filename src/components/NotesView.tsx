import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, FileText, List, ListFilter, MoreHorizontal, Pin, Plus, Search, Trash2, Type, Bold, Italic, Eye, Pencil, Hash, Quote, ListChecks, Link2 } from 'lucide-react'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { WebLink, webLinkPattern } from './TextLinks'
import type { Note, NoteFilter } from '../types'
import type { NoteSaveStatus } from '../lib/use-note-autosave'

type Props = {
  notes: Note[]; selectedId: string | null; onSelect: (id: string | null) => void
  onCreate: () => void; onEdit: (id: string, changes: Partial<Pick<Note, 'title' | 'content' | 'pinned'>>) => void
  onDelete: (id: string) => void; filter: NoteFilter; onFilter: (filter: NoteFilter) => void
  saveStatus: NoteSaveStatus; onRetrySave: () => void
}
function notePreview(value: string) { return value.replace(/[#*`>\-[\]]/g, '').replace(/\s+/g, ' ').trim() || 'Empty note' }

const markdownComponents: Components = {
  a: ({ node: _node, href, children, ...props }) => {
    if (!href) return children
    if (webLinkPattern.test(href)) return <WebLink {...props} href={href}>{children}</WebLink>
    return <a {...props} href={href}>{children}</a>
  },
}

export function NotesView({ notes, selectedId, onSelect, onCreate, onEdit, onDelete, filter, onFilter, saveStatus, onRetrySave }: Props) {
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const note = notes.find(n => n.id === selectedId)
  const filtered = [...notes].filter(n => (filter === 'all' || n.pinned) && `${n.title} ${n.content}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at))
  useEffect(() => { setPreview(false); setShowDelete(false) }, [selectedId])
  function insertMarkdown(prefix: string, suffix = prefix, placeholder = 'text', selectInSuffix?: string) {
    if (!note) return
    const area = areaRef.current
    const start = area?.selectionStart ?? note.content.length
    const end = area?.selectionEnd ?? start
    const selection = note.content.slice(start, end) || placeholder
    const content = note.content.slice(0, start) + prefix + selection + suffix + note.content.slice(end)
    onEdit(note.id, { content })
    const selectionStart = start + prefix.length + (selectInSuffix ? selection.length + suffix.indexOf(selectInSuffix) : 0)
    requestAnimationFrame(() => { area?.focus(); area?.setSelectionRange(selectionStart, selectionStart + (selectInSuffix ?? selection).length) })
  }
  return <div className={`notes-layout ${note ? 'note-open-mobile' : ''}`}>
    <aside className="notes-list-pane">
      <div className="notes-list-heading"><div><h1>Notes<span className="title-count">{notes.length}</span></h1></div><button className="icon-button accent" aria-label="Create note" title="Create note" onClick={onCreate}><Plus size={20}/></button></div>
      <label className="search-input"><Search size={17}/><input placeholder="Search your notes..." value={search} onChange={e => setSearch(e.target.value)}/>{search && <button onClick={() => setSearch('')} aria-label="Clear search">×</button>}</label>
      <div className="note-filter-row"><button className={filter === 'all' ? 'selected' : ''} onClick={() => onFilter('all')}><ListFilter size={14}/> All notes</button><button className={filter === 'pinned' ? 'selected' : ''} onClick={() => onFilter('pinned')}><Pin size={13}/> Pinned</button></div>
      <div className="notes-scroll">
        {filtered.length ? filtered.map(n => <button key={n.id} onClick={() => onSelect(n.id)} className={`note-list-card ${n.id === selectedId ? 'selected' : ''}`}><span className="note-list-top"><strong>{n.title || 'Untitled note'}</strong>{n.pinned && <Pin size={13} className="pin-small"/>}</span><span className="note-list-preview">{notePreview(n.content).slice(0, 95)}</span><span className="note-list-date"><FileText size={12}/>{formatDistanceToNow(parseISO(n.updated_at), { addSuffix: true })}</span></button>) : <div className="notes-empty-list"><List size={22}/><strong>No notes found</strong><p>{search ? 'Try another search.' : 'Create your first note.'}</p>{!search && <button className="button secondary" onClick={onCreate}>New note</button>}</div>}
      </div>

    </aside>
    <section className="notes-editor-pane">
      {note ? <>
        <div className="editor-toolbar-top"><button className="editor-back" onClick={() => onSelect(null)}><ChevronLeft size={17}/> All notes</button><div className="editor-top-right"><span className={`save-indicator ${saveStatus === 'unsaved' ? 'save-failed' : ''}`} role="status"><span className={saveStatus === 'saving' ? 'saving-pulse' : 'saved-dot'}/>{saveStatus === 'saving' ? 'Saving...' : saveStatus === 'unsaved' ? 'Not saved' : 'Autosaved'}{saveStatus === 'unsaved' && <button className="retry-save" onClick={onRetrySave}>Retry</button>}</span><button className={`icon-button ${note.pinned ? 'pin-active' : ''}`} onClick={() => onEdit(note.id, { pinned: !note.pinned })} aria-label={note.pinned ? 'Unpin note' : 'Pin note'} title={note.pinned ? 'Unpin note' : 'Pin note'}><Pin size={18}/></button><div className="delete-container"><button className="icon-button" onClick={() => setShowDelete(!showDelete)} aria-label="Note actions"><MoreHorizontal size={20}/></button>{showDelete && <div className="floating-menu"><button className="delete-action" onClick={() => { onDelete(note.id); setShowDelete(false) }}><Trash2 size={15}/> Delete note</button></div>}</div></div></div>
        <div className="editor-body"><div className="editor-meta"><span className="meta-icon"><FileText size={14}/></span> NOTE <span className="meta-divider">·</span> Edited {format(parseISO(note.updated_at), 'MMM d, yyyy')}</div><input className="note-title-input" placeholder="Untitled note" aria-label="Note title" value={note.title} onChange={e => onEdit(note.id, { title: e.target.value })}/><div className="editor-format-toolbar"><button title="Heading" onClick={() => insertMarkdown('## ', '', 'Heading')}><Type size={17}/></button><span className="toolbar-divider"/><button title="Bold" onClick={() => insertMarkdown('**','**')}><Bold size={17}/></button><button title="Italic" onClick={() => insertMarkdown('*','*')}><Italic size={17}/></button><span className="toolbar-divider"/><button title="Bullet list" onClick={() => insertMarkdown('- ','','List item')}><List size={17}/></button><button title="Checklist" onClick={() => insertMarkdown('- [ ] ','','Task')}><ListChecks size={18}/></button><button title="Quote" onClick={() => insertMarkdown('> ','','Quote')}><Quote size={17}/></button><span className="toolbar-divider"/><button title="Heading 3" onClick={() => insertMarkdown('### ','','Heading')}><Hash size={17}/></button><button title="Insert link" aria-label="Insert link" disabled={preview} onClick={() => insertMarkdown('[', '](https://)', 'Link text', 'https://')}><Link2 size={17}/></button><span className="toolbar-spacer"/><button className={`editor-mode ${!preview ? 'mode-active' : ''}`} onClick={() => setPreview(false)} title="Edit Markdown"><Pencil size={16}/><span>Edit</span></button><button className={`editor-mode ${preview ? 'mode-active' : ''}`} onClick={() => setPreview(true)} title="Preview formatted note"><Eye size={16}/><span>Preview</span></button></div>
          {preview ? <div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{note.content || '*Nothing here yet. Switch to Edit and start writing.*'}</ReactMarkdown></div> : <textarea ref={areaRef} className="note-content-input" placeholder="Write a note..." aria-label="Note content" spellCheck value={note.content} onChange={e => onEdit(note.id, { content: e.target.value })}/>}
          <div className="editor-bottom-meta"><span>Markdown supported</span><span>{note.content.trim() ? note.content.trim().split(/\s+/).length : 0} words</span></div>
        </div>
      </> : <div className="editor-placeholder"><span className="placeholder-art"><FileText size={38}/></span><h2>Select a note</h2><p>Choose a note or create one.</p><button className="button primary" onClick={onCreate}><Plus size={17}/> Create a note</button></div>}
    </section>
  </div>
}
