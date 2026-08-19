// PATH: src/components/upload/DropZone.tsx
//
// Global drag-and-drop overlay.
// Mounted once at the App root. Listens to window drag events.
// When the user drags files anywhere over the app, an overlay appears.
// When dropped, the files are passed to a registered handler.
//
// Pattern: a global "active drop target" registered via setDropTarget().
// The component that wants to accept drops (e.g. ChatPanel) calls
// setDropTarget(handler) on mount and clearDropTarget() on unmount.
// If no handler is registered, drops are silently ignored.

import { useEffect, useState } from 'react'

// ── Module-level registry of the active drop handler ────────────────────────
// Multiple components can compete for "active" — last one wins (LIFO stack).

type DropHandler = (files: File[]) => void

interface RegistryEntry {
  id:       string
  label:    string                  // shown in the overlay
  handler:  DropHandler
}

const stack: RegistryEntry[] = []
let stackVersion = 0
const subscribers = new Set<() => void>()

function notify() {
  stackVersion += 1
  subscribers.forEach(fn => fn())
}

export function setDropTarget(entry: RegistryEntry): () => void {
  // Remove any previous entry with the same id
  const idx = stack.findIndex(e => e.id === entry.id)
  if (idx >= 0) stack.splice(idx, 1)
  stack.push(entry)
  notify()
  // Return cleanup function
  return () => {
    const i = stack.findIndex(e => e.id === entry.id)
    if (i >= 0) stack.splice(i, 1)
    notify()
  }
}

function getActiveEntry(): RegistryEntry | null {
  return stack[stack.length - 1] ?? null
}

// ── DropZone component (mount once at App root) ──────────────────────────────

export default function DropZone() {
  const [dragging, setDragging] = useState(false)
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  const [, forceTick] = useState(0)

  // Re-render when stack changes
  useEffect(() => {
    const fn = () => forceTick(t => t + 1)
    subscribers.add(fn)
    return () => { subscribers.delete(fn) }
  }, [])

  // Drag tracking via a counter (dragenter / dragleave fire many times)
  useEffect(() => {
    let dragCounter = 0

    function isFileDrag(e: DragEvent): boolean {
      if (!e.dataTransfer) return false
      return Array.from(e.dataTransfer.items ?? []).some(it => it.kind === 'file')
        || (e.dataTransfer.types?.includes('Files') ?? false)
    }

    function onDragEnter(e: DragEvent) {
      if (!isFileDrag(e)) return
      const active = getActiveEntry()
      if (!active) return                     // no handler → ignore
      dragCounter++
      setDragging(true)
      setActiveLabel(active.label)
    }

    function onDragOver(e: DragEvent) {
      if (!isFileDrag(e)) return
      const active = getActiveEntry()
      if (!active) return
      e.preventDefault()                      // allow drop
    }

    function onDragLeave(e: DragEvent) {
      if (!isFileDrag(e)) return
      dragCounter = Math.max(0, dragCounter - 1)
      if (dragCounter === 0) setDragging(false)
    }

    function onDrop(e: DragEvent) {
      if (!isFileDrag(e)) return
      const active = getActiveEntry()
      e.preventDefault()
      dragCounter = 0
      setDragging(false)
      if (!active) return
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length > 0) {
        active.handler(files)
      }
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  if (!dragging) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'rgba(15,23,42,0.85)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none'
    }}>
      <div style={{
        padding: '40px 60px',
        borderRadius: 16,
        border: '2px dashed rgba(59,130,246,0.6)',
        background: 'rgba(59,130,246,0.08)',
        textAlign: 'center',
        maxWidth: 460,
        animation: 'lp-dropzone-pulse 1.4s ease-in-out infinite'
      }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>📥</div>
        <div style={{
          fontSize: 18, fontWeight: 600, color: 'var(--lp-text)',
          marginBottom: 8, letterSpacing: '-0.01em'
        }}>
          Drop files to upload
        </div>
        <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.5 }}>
          {activeLabel ?? 'Drop files anywhere on the app'}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 12 }}>
          Images (JPG, PNG, HEIC, WebP) and PDFs · up to 50&nbsp;MB
        </div>
      </div>

      <style>{`
        @keyframes lp-dropzone-pulse {
          0%, 100% { opacity: 0.9; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.02); }
        }
      `}</style>
    </div>
  )
}