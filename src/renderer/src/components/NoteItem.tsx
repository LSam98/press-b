import { useState } from 'react'
import { PinnedNote } from '../types'
import NoteForm from './NoteForm'

interface NoteItemProps {
  note: PinnedNote
  onUpdate: (note: PinnedNote) => void
  onDelete: (id: string) => void
}

export default function NoteItem({ note, onUpdate, onDelete }: NoteItemProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  if (isEditing) {
    return (
      <NoteForm
        initialNote={note}
        onSubmit={(updatedNote) => {
          onUpdate(updatedNote)
          setIsEditing(false)
        }}
        onCancel={() => setIsEditing(false)}
      />
    )
  }

  return (
    <div className="flex gap-3 p-3 border-b border-neutral-700 hover:bg-neutral-800/50 transition flex-col">
      {/* Header with title and actions */}
      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-medium text-neutral-200 cursor-pointer hover:text-blue-400 transition"
            onClick={() => setIsExpanded(!isExpanded)}
            title="Click to expand/collapse"
          >
            {note.title}
          </h3>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 text-neutral-400 hover:text-neutral-300 hover:bg-neutral-700 rounded transition"
            title="Edit note"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
              <path d="M12.146.854a.5.5 0 0 1 .708 0l2.292 2.292a.5.5 0 0 1 0 .708l-10.5 10.5a.5.5 0 0 1-.208.082l-4.5 1.5a.5.5 0 0 1-.65-.65l1.5-4.5a.5.5 0 0 1 .082-.208l10.5-10.5z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(note.id)}
            className="p-1 text-neutral-400 hover:text-red-400 hover:bg-neutral-700 rounded transition"
            title="Delete note"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
              <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 1a.5.5 0 0 0-.5.5v1h11V1.5a.5.5 0 0 0-.5-.5H2.5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded content (read-only, click title to expand) */}
      {isExpanded && (
        <p className="text-xs text-neutral-400 whitespace-pre-wrap bg-neutral-800 p-2 rounded border border-neutral-700 max-h-[200px] overflow-y-auto">
          {note.content}
        </p>
      )}
    </div>
  )
}
