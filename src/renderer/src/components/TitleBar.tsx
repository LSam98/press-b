interface TitleBarProps {
  projectName: string
  onSelectProject: (projectRoot: string) => void
}

export default function TitleBar({ projectName, onSelectProject }: TitleBarProps): React.JSX.Element {
  const handleClose = () => {
    if (window.devfloat?.window?.close) {
      window.devfloat.window.close()
    }
  }

  const handleSelectFolder = async () => {
    try {
      if (!window.devfloat) {
        console.error('API not available')
        return
      }
      const folder = await window.devfloat.dialog.selectFolder()
      if (folder) {
        onSelectProject(folder)
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
    }
  }

  return (
    <div className="draggable flex items-center justify-between h-12 bg-neutral-800 border-b border-neutral-700 px-3 py-2 flex-shrink-0">
      <div className="flex-1 text-center">
        <h1 className="text-sm font-semibold text-neutral-200 truncate">{projectName}</h1>
      </div>
      <div className="draggable-no-drag flex items-center gap-2 ml-2">
        <button
          onClick={() => {
            console.log('Folder icon clicked')
            handleSelectFolder()
          }}
          className="draggable-no-drag p-1 hover:bg-neutral-700 rounded transition text-neutral-400 hover:text-neutral-300 cursor-pointer"
          title="Select project folder"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
            <path d="M.5 1A.5.5 0 0 1 1 .5h3.362a.5.5 0 0 1 .468.266l1.122 1.856h8.5a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H1a.5.5 0 0 1-.5-.5V1z" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="draggable-no-drag p-1 hover:bg-red-900 rounded transition text-neutral-400 hover:text-red-400 cursor-pointer"
          title="Close DevFloat (Esc)"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
