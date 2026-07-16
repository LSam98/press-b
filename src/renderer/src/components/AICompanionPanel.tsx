import ReentryBrief from './ReentryBrief'
import SuggestionsPanel from './SuggestionsPanel'
import AskPanel from './AskPanel'
import { Suggestion, ChatMessage } from '../types'

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
  // Ask
  chatMessages: ChatMessage[]
  isAsking: boolean
  askError: string | null
  onAsk: (question: string) => void
  onClearChat: () => void
  // Nav
  onGoToSettings: () => void
}

// The AI Companion tab — home for everything AI in Press B. Re-Entry Brief up
// top (teal), on-demand Suggestions below (amber), project-aware Ask at the
// bottom (violet).
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
      <AskPanel
        hasKey={props.hasKey}
        messages={props.chatMessages}
        isAsking={props.isAsking}
        error={props.askError}
        onAsk={props.onAsk}
        onClear={props.onClearChat}
        onGoToSettings={props.onGoToSettings}
      />
    </div>
  )
}
