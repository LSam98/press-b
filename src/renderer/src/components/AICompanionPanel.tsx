import ReentryBrief from './ReentryBrief'
import SuggestionsPanel from './SuggestionsPanel'
import { Suggestion } from '../types'

interface AICompanionPanelProps {
  hasKey: boolean
  // Brief
  brief: string | null
  briefGeneratedAt: string | null
  isGeneratingBrief: boolean
  briefError: string | null
  onGenerateBrief: () => void
  // Suggestions
  suggestions: Suggestion[] | null
  isSuggesting: boolean
  suggestError: string | null
  onGenerateSuggestions: () => void
  onAcceptSuggestion: (s: Suggestion) => void
  onDismissSuggestion: (s: Suggestion) => void
  // Nav
  onGoToSettings: () => void
}

// The AI Companion tab — home for everything AI in DevFloat. Re-Entry Brief up
// top (teal), on-demand Suggestions below (amber/yellow).
export default function AICompanionPanel(props: AICompanionPanelProps): React.JSX.Element {
  return (
    <div className="h-full overflow-y-auto">
      <ReentryBrief
        hasKey={props.hasKey}
        brief={props.brief}
        generatedAt={props.briefGeneratedAt}
        isGenerating={props.isGeneratingBrief}
        error={props.briefError}
        onGenerate={props.onGenerateBrief}
        onGoToSettings={props.onGoToSettings}
      />
      <SuggestionsPanel
        hasKey={props.hasKey}
        suggestions={props.suggestions}
        isSuggesting={props.isSuggesting}
        error={props.suggestError}
        onGenerate={props.onGenerateSuggestions}
        onAccept={props.onAcceptSuggestion}
        onDismiss={props.onDismissSuggestion}
        onGoToSettings={props.onGoToSettings}
      />
    </div>
  )
}
