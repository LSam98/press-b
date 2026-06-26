interface FileLinkProps {
  file: string
  line?: number
}

// Last two path segments (folder/file) for a compact, readable tooltip.
function formatFilePath(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/'
  const parts = filePath.split(sep)
  return parts.length >= 2 ? parts.slice(-2).join('/') : parts[parts.length - 1] || filePath
}

// Compact, icon-only link that opens a file at a line in the user's IDE.
// Shared by tasks and AI suggestions so there's one open-file path and one look.
export default function FileLink({ file, line }: FileLinkProps): React.JSX.Element {
  const open = async (): Promise<void> => {
    if (!window.pressB) return
    try {
      await window.pressB.shell.openFile(file, line)
    } catch (error) {
      console.error('Error opening file:', error)
    }
  }

  return (
    <button
      onClick={open}
      title={`Open ${formatFilePath(file)}${line ? ':' + line : ''} in IDE`}
      className="text-neutral-500 hover:text-blue-300 transition cursor-pointer flex-shrink-0"
    >
      {/* external-link / jump-to icon */}
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
        />
      </svg>
    </button>
  )
}
