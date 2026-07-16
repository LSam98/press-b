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
  AskOptions,
  ChatMessage,
  GenerateBriefOptions,
  GenerateSuggestionsOptions,
  ProjectDigest,
  Suggestion,
  SuggestionLens,
  SuggestionVolume
} from './types'

const SYSTEM_PROMPT = `You are Press B's session-resume assistant. The developer is returning to a coding project and wants to quickly re-enter their working context.

Given a digest of the project's tasks, notes, and recent activity, write a concise re-entry brief:
- 3 to 5 sentences summarizing where things stand: what was recently worked on, what's open, what's high-priority or blocking.
- Then a single concrete "Suggested next step:" line.

Be specific — reference actual task titles, files, and notes from the digest. Do not invent work that isn't in the digest. Write in a calm, direct tone, second person ("You were…"). No preamble, no headers, just the brief.

Tasks and pinned notes in the digest carry their age (e.g. "(updated 34d ago)", "(created 44d ago)"). Weigh recency heavily: an open task untouched for weeks — or an alarming old note — is POSSIBLY STALE; the issue it describes may long since be resolved. Never present a stale task or note as the urgent next step unless recent activity corroborates it; at most, suggest quickly verifying and closing/deleting it. Base "where you left off" on the freshest items.`

const ASK_SYSTEM = `You are Press B's project assistant. Press B is a floating companion that holds a developer's working state for one project — tasks (with priority/status/age and code locations), pinned notes, and recent activity. The developer chats with you to interrogate that state and to get help while working.

How to answer:
- Ground answers in the PROJECT DIGEST whenever the question touches the project: cite actual task titles, notes, and files. Never invent tasks, notes, or paths that aren't in the digest.
- When you reference a specific code location THAT APPEARS IN THE DIGEST, cite it exactly as [relative/path.ts:123] (square brackets, relative path, optional :line). The app renders these as clickable links into the editor. Never fabricate a citation.
- Items carry their age (e.g. "(updated 34d ago)"). Weigh recency: weeks-idle open items are possibly stale — say so rather than treating them as current.
- General programming questions are fine too — answer them directly; use project context only when it's actually relevant.
- Be concise and direct: short paragraphs or tight bullet lists, no filler, no restating the question. This renders in a narrow 380px panel.
- PLAIN TEXT ONLY — your answer is rendered verbatim, not as markdown. No **bold**, no # headers, no backticks, no markdown links. Use plain sentences, simple "-" bullets, and blank lines for structure. The ONLY bracket syntax allowed is the [path:line] citation format above.
- If the digest genuinely doesn't contain what's asked ("what did I name that branch?"), say so plainly instead of guessing.`

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

const SUGGESTIONS_SYSTEM = `You are Press B's suggestion assistant — a restrained senior engineer who proposes high-signal next tasks for a developer's project.

CORE RULES — follow these exactly:
- Quality over quantity. Returning an EMPTY list is a correct, valued answer when you have nothing sharp to say. Never pad to fill the cap.
- Only propose items that are NON-OBVIOUS and genuinely useful — things the developer would thank you for noticing, not busywork or generic advice.
- Never restate work that already exists as a task in the digest. Never repeat dismissed items.
- Tasks and pinned notes carry their age (e.g. "(updated 34d ago)", "(created 44d ago)"). Weigh recency heavily: an open task or alarming note idle for weeks is POSSIBLY STALE (the issue may long since be resolved). Do not build a suggestion on a stale item as if it were current — if it seems important but stale, the sharpest suggestion is to verify-and-close it. Anchor suggestions to the freshest activity.
- Each suggestion is a concrete, actionable task with a short, specific title.
- For each, give a one-sentence "reasoning" that references something real in the digest (a task, note, file, or pattern), and an honest confidence level.

The digest surfaces each task's location as "[file:line]" and may include a "LINKED CODE SNIPPETS" section showing the exact relative path and code. When — and ONLY when — your suggestion is anchored to a specific code location that appears in the digest, include "linkedFile" (the exact relative path as shown, e.g. "src/App.tsx") and "linkedLine" (the integer line number) so the user can jump straight to it. If your suggestion builds on or refines an existing task that already shows a "[file:line]", reuse that exact location. If the suggestion is general or you are unsure of the location, OMIT both fields entirely. Never invent a path or line.

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

  // Project-aware chat (Pillar 3). Streams text deltas via onText; resolves with
  // the full answer. The digest rides as the cached system block (stable prefix),
  // so multi-turn follow-ups reuse the cache and only the conversation grows.
  async ask(
    digest: ProjectDigest,
    opts: AskOptions,
    onText: (delta: string) => void
  ): Promise<string> {
    const messages: ChatMessage[] = opts.history.filter((m) => m.content.trim() !== '')

    const stream = this.client.messages.stream({
      model: opts.model,
      max_tokens: 2048,
      system: [
        { type: 'text', text: ASK_SYSTEM },
        {
          type: 'text',
          text: `PROJECT DIGEST:\n${digest.text}`,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages
    })

    stream.on('text', (delta) => onText(delta))

    const final = await stream.finalMessage()
    return final.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()
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
