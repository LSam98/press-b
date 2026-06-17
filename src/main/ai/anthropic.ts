// Anthropic implementation of the AIProvider interface.
//
// Runs in the main process only (the renderer can't hold the API key). The
// stable project digest is sent as a cached system block so regenerated briefs
// are cheap. Default model is Sonnet 4.6 (the user's tiered choice for briefs);
// the model is configurable per-project via settings.

import Anthropic from '@anthropic-ai/sdk'
import { AIProvider, GenerateBriefOptions, ProjectDigest } from './types'

const SYSTEM_PROMPT = `You are DevFloat's session-resume assistant. The developer is returning to a coding project and wants to quickly re-enter their working context.

Given a digest of the project's tasks, notes, and recent activity, write a concise re-entry brief:
- 3 to 5 sentences summarizing where things stand: what was recently worked on, what's open, what's high-priority or blocking.
- Then a single concrete "Suggested next step:" line.

Be specific — reference actual task titles, files, and notes from the digest. Do not invent work that isn't in the digest. Write in a calm, direct tone, second person ("You were…"). No preamble, no headers, just the brief.`

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
