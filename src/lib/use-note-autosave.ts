import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Repository } from '../data/repository'
import type { Note } from '../types'

type Patch = Pick<Note, 'title' | 'content' | 'pinned'>
export type NoteSaveStatus = 'saved' | 'saving' | 'unsaved'

export function useNoteAutosave(repository: Repository, onError: (message: string) => void) {
  const [notes, setNotes] = useState<Note[]>([])
  const current = useRef<Note[]>([])
  const revision = useRef(0)
  const dirty = useRef(new Set<string>())
  const failed = useRef(new Set<string>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pending = useRef(new Map<string, Patch>())
  const inFlight = useRef(new Map<string, Promise<void>>())
  const [, notify] = useReducer(n => n + 1, 0)

  const replace = useCallback((next: Note[]) => { current.current = next; setNotes(next) }, [])
  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer)
    timers.current.clear()
    pending.current.clear()
  }, [])

  const mergeRemote = useCallback((remote: Note[], startedRevision: number) => {
    if (startedRevision !== revision.current) return
    const local = new Map(current.current.map(note => [note.id, note]))
    const received = new Set(remote.map(note => note.id))
    // A remote deletion must not remove a draft that has not been saved.
    replace([
      ...remote.map(note => dirty.current.has(note.id) ? local.get(note.id) ?? note : note),
      ...current.current.filter(note => dirty.current.has(note.id) && !received.has(note.id)),
    ])
  }, [replace])

  const enqueue = useCallback((id: string, patch: Patch) => {
    const previous = inFlight.current.get(id) ?? Promise.resolve()
    failed.current.delete(id)
    revision.current++
    const next = previous.catch(() => {}).then(() => repository.saveNote(id, patch)).then(() => {
      if (inFlight.current.get(id) === next && !pending.current.has(id)) dirty.current.delete(id)
    }).catch((error: unknown) => {
      failed.current.add(id)
      onError(`Could not save note: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }).finally(() => {
      if (inFlight.current.get(id) === next) inFlight.current.delete(id)
      revision.current++
      notify()
    })
    inFlight.current.set(id, next)
    notify()
    return next
  }, [repository, onError])

  function edit(id: string, changes: Partial<Patch>) {
    const note = current.current.find(note => note.id === id)
    if (!note) return
    const updated = { ...note, ...changes, updated_at: new Date().toISOString() }
    revision.current++
    dirty.current.add(id)
    failed.current.delete(id)
    replace(current.current.map(note => note.id === id ? updated : note))
    pending.current.set(id, { title: updated.title, content: updated.content, pinned: updated.pinned })
    clearTimeout(timers.current.get(id))
    timers.current.set(id, setTimeout(() => {
      const patch = pending.current.get(id)
      pending.current.delete(id)
      timers.current.delete(id)
      if (patch) void enqueue(id, patch).catch(() => {})
    }, 650))
    notify()
  }

  // Used by Retry, sign-out and app updates. Failed saves remain dirty and retryable.
  async function flush() {
    for (;;) {
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
      await Promise.allSettled([...inFlight.current.values()])
      const patches = new Map(pending.current)
      pending.current.clear()
      for (const id of dirty.current) {
        const note = current.current.find(note => note.id === id)
        if (!note) throw new Error('An unsaved note is unavailable. Export your data before leaving.')
        patches.set(id, { title: note.title, content: note.content, pinned: note.pinned })
      }
      if (!patches.size) { notify(); return }
      const results = await Promise.allSettled([...patches].map(([id, patch]) => enqueue(id, patch)))
      const failure = results.find(result => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    }
  }

  async function create() {
    revision.current++
    try {
      const note = await repository.createNote()
      replace([note, ...current.current.filter(existing => existing.id !== note.id)])
      return note
    } finally { revision.current++ }
  }

  async function remove(id: string) {
    revision.current++
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    try {
      await inFlight.current.get(id)?.catch(() => {})
      await repository.removeNote(id)
      pending.current.delete(id)
      dirty.current.delete(id)
      failed.current.delete(id)
      replace(current.current.filter(note => note.id !== id))
    } catch (error) {
      if (dirty.current.has(id)) failed.current.add(id)
      throw error
    } finally { revision.current++; notify() }
  }

  function status(id: string): NoteSaveStatus {
    if (!dirty.current.has(id)) return 'saved'
    return failed.current.has(id) && !timers.current.has(id) && !inFlight.current.has(id) ? 'unsaved' : 'saving'
  }

  return { notes, revision, mergeRemote, edit, create, remove, flush, status,
    saving: timers.current.size > 0 || inFlight.current.size > 0, hasUnsaved: dirty.current.size > 0 }
}
