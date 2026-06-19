// Shared types for the AI layer. Kept provider-agnostic so we can add other
// providers (OpenAI, local Ollama models) behind the same interface later.

export type PrivacyScope = 'metadata' | 'metadata+snippets' | 'broad'

// A compact, bounded text summary of the project's current state, assembled
// from .pressb.json (+ optional linked-code snippets). This is the same
// component a future "Press B-as-MCP-server" would expose.
export interface ProjectDigest {
  // Human-readable text block sent to the model as the stable, cacheable context.
  text: string
  // Bookkeeping for logging / debugging — never sent verbatim as the prompt.
  taskCount: number
  noteCount: number
  snippetCount: number
}

export interface GenerateBriefOptions {
  model: string
  // The current local date/time string, injected by the caller so the digest
  // text itself stays stable (and cacheable) across regenerations.
  now: string
}

// AI Suggestion Engine
export type SuggestionVolume = 'minimal' | 'balanced' | 'proactive'
export type SuggestionLens = 'next-step' | 'code-quality' | 'missing-tests' | 'architecture'

export interface Suggestion {
  lens: SuggestionLens
  taskType: 'TODO' | 'PENDING' | 'REFACTOR' | 'BUG'
  title: string
  body: string
  priority: 'high' | 'medium' | 'low'
  reasoning: string
  confidence: 'high' | 'medium' | 'low'
  // Optional: set when the suggestion is anchored to a code location in the digest,
  // so the accepted task becomes click-to-open. Sanitized in sanitizeLink().
  linkedFile?: string
  linkedLine?: number
}

export interface GenerateSuggestionsOptions {
  model: string
  volume: SuggestionVolume
  lenses: SuggestionLens[]
  // Titles the user has already dismissed — the model is told not to repeat them.
  dismissed: string[]
}

// First implementation is Anthropic; future providers implement this same shape.
export interface AIProvider {
  generateBrief(digest: ProjectDigest, opts: GenerateBriefOptions): Promise<string>
  generateSuggestions(
    digest: ProjectDigest,
    opts: GenerateSuggestionsOptions
  ): Promise<Suggestion[]>
}
