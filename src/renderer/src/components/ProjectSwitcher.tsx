import { useState, useRef, useEffect } from 'react'

interface ProjectSwitcherProps {
  currentRoot: string
  recentProjects: string[]
  onSelect: (root: string) => void
  onRemove: (root: string) => void
  onOpenFolder: () => void
}

function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() || p
}

export default function ProjectSwitcher({
  currentRoot,
  recentProjects,
  onSelect,
  onRemove,
  onOpenFolder
}: ProjectSwitcherProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside-click / Esc
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="draggable-no-drag relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 max-w-full cursor-pointer group"
        title={currentRoot}
      >
        <span className="text-sm font-semibold text-neutral-200 truncate">
          {basename(currentRoot)}
        </span>
        <span className="text-[10px] text-neutral-500 group-hover:text-neutral-300">▾</span>
      </button>

      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-7 z-50 w-64 bg-neutral-800 border border-neutral-700 rounded shadow-lg py-1 text-left">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-500">
            Recent projects
          </div>
          {recentProjects.length === 0 && (
            <div className="px-3 py-1.5 text-xs text-neutral-500">No recent projects yet</div>
          )}
          {recentProjects.map((root) => {
            const active = root === currentRoot
            return (
              <div
                key={root}
                className="group/item flex items-center px-2 py-1 hover:bg-neutral-700/60 cursor-pointer"
                onClick={() => {
                  if (!active) onSelect(root)
                  setOpen(false)
                }}
              >
                <span className="w-3 text-teal-400 text-xs flex-shrink-0">{active ? '✓' : ''}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-neutral-200 truncate">
                    {basename(root)}
                  </div>
                  <div className="text-[10px] text-neutral-500 truncate">{root}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(root)
                  }}
                  className="ml-1 px-1 text-neutral-600 hover:text-red-400 opacity-0 group-hover/item:opacity-100 transition cursor-pointer flex-shrink-0"
                  title="Forget this project"
                >
                  ×
                </button>
              </div>
            )
          })}
          <div className="border-t border-neutral-700 mt-1 pt-1">
            <button
              onClick={() => {
                onOpenFolder()
                setOpen(false)
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-teal-400 hover:bg-neutral-700/60 cursor-pointer"
            >
              ＋ Open folder…
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
