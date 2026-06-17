// Anthropic implementation of the AIProvider interface.
//
// Runs in the main process only (the renderer can't hold the API key). The
// stable project digest is sent as a cached system block so regenerated briefs
// are cheap. Default model is Sonnet 4.6 (the user's tiered choice for briefs);
// the model is configurable per-project via settings.

import Anthropic from '@anthropic-ai/sdk'
import * as path from 'path'
import {
  AIProvider,
  GenerateBriefOptions,
  GenerateSuggestionsOptions,
  ProjectDigest,
  Suggestion,
  SuggestionLens,
  SuggestionVolume
} from './types'

const SYSTEM_PROMPT = `You are DevFloat's session-resume assistant. The developer is returning to a coding project and wants to quickly re-enter their working context.

Given a digest of the project's tasks, notes, and recent activity, write a concise re-entry brief:
- 3 to 5 sentences summarizing where things stand: what was recently worked on, what's open, what's high-priority or blocking.
- Then a single concrete "Suggested next step:" line.

Be specific — reference actual task titles, files, and notes from the digest. Do not invent work that isn't in the digest. Write in a calm, direct tone, second person ("You were…"). No preamble, no headers, just the brief.`

// How many suggestions each volume level may return. Scarcity is deliberate —
// the prompt also licenses returning none.
const VOLUME_CAP: Record<SuggestionVolume, number> = {
  minimal: 1,
  balanced: 2,
  proactive: 3
}

const LENS_DESCRIPTIONS: Record<SuggestionLens, string> = {
  'next-step': 'the single most logical next action to make progress, given recent activity and open tasks',
  'code-quality': 'a concrete, justified refactor or cleanup that would meaningfully improve the code',
  'missing-tests': 'a specific gap in test coverage worth filling',
  architecture: 'a higher-level structural improvement (module boundaries, separation of concerns)'
}

const SUGGESTIONS_SYSTEM = `You are DevFloat's suggestion assistant — a restrained senior engineer who proposes high-signal next tasks for a developer's project.

CORE RULES — follow these exactly:
- Quality over quantity. Returning an EMPTY list is a correct, valued answer when you have nothing sharp to say. Never pad to fill the cap.
- Only propose items that are NON-OBVIOUS and genuinely useful — things the developer would thank you for noticing, not busywork or generic advice.
- Never restate work that already exists as a task in the digest. Never repeat dismissed items.
- Each suggestion is a concrete, actionable task with a short, specific title.
- For each, give a one-sentence "reasoning" that references something real in the digest (a task, note, file, or pattern), and an honest confidence level.

The digest surfaces each task's location as "[file:line]" and may include a "LINKED CODE SNIPPETS" section showing the exact relative path and code. When — and ONLY when — your suggestion is anchored to a specific code location that appears in the digest, include "linkedFile" (the exact relative path as shown, e.g. "src/App.tsx") and "linkedLine" (the integer line number) so the user can jump straight to it. If the suggestion is general or you are unsure of the location, OMIT both fields entirely. Never invent a path or line.

You will be told which LENSES to focus on and the MAXIMUM number of suggestions. Respect both.

Respond with ONLY a JSON object, no prose, no markdown fences, in exactly this shape:
{"suggestions":[{"lens":"<one of the requested lenses>","taskType":"TODO|PENDING|REFACTOR|BUG","title":"...","body":"...","priority":"high|medium|low","reasoning":"...","confidence":"high|medium|low","linkedFile":"<optional relative path>","linkedLine":<optional integer>}]}
If you have nothing worth suggesting, return {"suggestions":[]}.`

// Strip a model-provided linked location to something safe: a relative,
// in-project path + a positive integer line. Either field may end up undefined
// (a bare linkedFile still opens at line 1; a bare linkedLine is meaningless and
// dropped). Guards against absolute paths and traversal.
function sanitizeLink(s: Suggestion): Suggestion {
  let linkedFile: string | undefined
  if (
    typeof s.linkedFile === 'string' &&
    s.linkedFile.trim() !== '' &&
    !path.isAbsolute(s.linkedFile) &&
    !/^[a-zA-Z]:[\\/]/.test(s.linkedFile) && // Windows drive prefix
    !s.linkedFile.split(/[\\/]/).includes('..')
  ) {
    linkedFile = s.linkedFile.trim()
  }
  const linkedLine =
    typeof s.linkedLine === 'number' && Number.isInteger(s.linkedLine) && s.linkedLine > 0
      ? s.linkedLine
      : undefined

  // linkedLine without a file is meaningless — drop it.
  return { ...s, linkedFile, linkedLine: linkedFile ? linkedLine : undefined }
}

// Tolerant extraction of the JSON object from the model's text response.
function parseSuggestions(text: string): Suggestion[] {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  } catch {
    return []
  }
}

export class AnthropicProvider implements AIProvider {
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async generateBrief(digest: ProjectDigest, opts: GenerateBriefOptions): Promise<string> {
    const response = await this.client.messages.create({
      model: opts.model,
      max_tokens: 1024,
      system: [
        { type: 'text', text: SYSTEM_PROMPT },
        {
          // The digest is the large, stable block — cache it so regenerating
          // the brief (same project state) is cheap. Volatile bits (the current
          // time) go in the user turn, after this breakpoint.
          type: 'text',
          text: `PROJECT DIGEST:\n${digest.text}`,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [
        {
          role: 'user',
          content: `It is currently ${opts.now}. Write my re-entry brief for this project.`
        }
      ]
    })

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()
  }

  async generateSuggestions(
    digest: ProjectDigest,
    opts: GenerateSuggestionsOptions
  ): Promise<Suggestion[]> {
    // Fall back to next-step if the user somehow disabled every lens.
    const lenses = opts.lenses.length ? opts.lenses : (['next-step'] as SuggestionLens[])
    const cap = VOLUME_CAP[opts.volume]

    const lensLines = lenses.map((l) => `- ${l}: ${LENS_DESCRIPTIONS[l]}`).join('\n')
    const exclusions = opts.dismissed.length
      ? `\n\nDo NOT re-suggest these previously dismissed items:\n${opts.dismissed.map((d) => `- ${d}`).join('\n')}`
      : ''

    const instructions = `Focus ONLY on these lenses:\n${lensLines}\n\nReturn AT MOST ${cap} suggestion(s) — fewer (or zero) is better than padding.${exclusions}`

    const response = await this.client.messages.create({
      model: opts.model,
      max_tokens: 1500,
      system: [
        { type: 'text', text: SUGGESTIONS_SYSTEM },
        {
          type: 'text',
          text: `PROJECT DIGEST:\n${digest.text}`,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [{ role: 'user', content: instructions }]
    })

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    // Trust-but-verify: enforce the cap and the requested lenses client-side too,
    // and sanitize any model-provided file:line link.
    return parseSuggestions(text)
      .filter((s) => lenses.includes(s.lens))
      .slice(0, cap)
      .map(sanitizeLink)
  }
}

// Map the SDK's typed errors to user-friendly messages for the renderer.
export function describeAIError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'Invalid API key. Check your Anthropic key in Settings.'
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return 'This API key does not have permission for the requested model.'
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Rate limited by the API. Wait a moment and try again.'
  }
  if (error instanceof Anthropic.APIError) {
    // Out-of-credits is a 400 with a billing message — surface the real cause
    // (API billing is separate from a Claude Pro subscription) rather than the
    // raw JSON error.
    if (/credit balance/i.test(error.message)) {
      return 'Your Anthropic API account is out of credits. Add credits at console.anthropic.com → Billing (this is separate from a Claude Pro subscription).'
    }
    return `API error${error.status ? ` (${error.status})` : ''}: ${error.message}`
  }
  return `Unexpected error: ${(error as Error).message || String(error)}`
}
