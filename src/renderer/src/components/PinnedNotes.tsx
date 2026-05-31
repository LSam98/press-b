import { useState } from 'react'
import { PinnedNote } from '../types'
import NoteItem from './NoteItem'
import NoteForm from './NoteForm'

interface PinnedNotesProps {
  notes: PinnedNote[]
  onAddNote: (note: PinnedNote) => void
  onUpdateNote: (note: PinnedNote) => void
  onDeleteNote: (id: string) => void
}

export default function PinnedNotes({ notes, onAddNote, onUpdateNote, onDeleteNote }: PinnedNotesProps): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showForm && (
        <NoteForm
          onSubmit={(note) => {
            onAddNote(note)
            setShowForm(false)
          }}
          onCancel={() => setShowForm(false)}
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
            <NoteItem
              key={note.id}
              note={note}
              onUpdate={onUpdateNote}
              onDelete={onDeleteNote}
            />
          ))
        ) : (
          <div className="p-4 text-center text-neutral-500">No pinned notes yet. Create one to get started!</div>
        )}
      </div>
    </div>
  )
}
