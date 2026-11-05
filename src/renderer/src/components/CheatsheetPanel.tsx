export default function CheatsheetPanel(): React.JSX.Element {
  return (
    <div className="flex flex-col h-full items-center justify-center p-6 gap-3">
      <span className="text-3xl">📋</span>
      <p className="text-neutral-300 text-sm font-medium">Cheatsheet</p>
      <p className="text-neutral-500 text-xs text-center">
        Quick-reference snippets and commands for this project.
        <br />
        Coming soon.
      </p>
    </div>
  )
}
