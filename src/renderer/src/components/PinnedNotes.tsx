import { useEffect, useState } from 'react'
import { PinnedNote } from '../types'
import NoteItem from './NoteItem'
import NoteForm from './NoteForm'

interface PinnedNotesProps {
  notes: PinnedNote[]
  onAddNote: (note: PinnedNote) => void
  onUpdateNote: (note: PinnedNote) => void
  onDeleteNote: (id: string) => void
  // Pre-filled draft pushed from outside (IDE deep link) — see TaskList.
  externalDraft?: PinnedNote | null
  onExternalDraftConsumed?: () => void
}

export default function PinnedNotes({
  notes,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  externalDraft,
  onExternalDraftConsumed
}: PinnedNotesProps): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [draftNote, setDraftNote] = useState<PinnedNote | null>(null)

  // Consume-and-clear, mirroring TaskList's external-draft handling.
  useEffect(() => {
    if (!externalDraft) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the form for an incoming IDE deep link
    setDraftNote(externalDraft)
    setShowForm(true)
    onExternalDraftConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to a new draft only, not to a re-created callback
  }, [externalDraft])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showForm && (
        <NoteForm
          key={draftNote?.id ?? 'blank'}
          initialNote={draftNote ?? undefined}
          submitLabel={draftNote ? 'Add Note' : undefined}
          onSubmit={(note) => {
            onAddNote(note)
            setShowForm(false)
            setDraftNote(null)
          }}
          onCancel={() => {
            setShowForm(false)
            setDraftNote(null)
          }}
        />
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="draggable-no-drag m-3 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700 transition cursor-pointer"
        >
          + New Note
        </button>
      )}

      <div className="flex-1 overflow-y-auto">
        {notes.length > 0 ? (
          notes.map((note) => (
            <NoteItem key={note.id} note={note} onUpdate={onUpdateNote} onDelete={onDeleteNote} />
          ))
        ) : (
          <div className="p-4 text-center text-neutral-500">
            No pinned notes yet. Create one to get started!
          </div>
        )}
      </div>
    </div>
  )
}
