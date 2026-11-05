// Cost estimates for Anthropic models, ported from the Lab 4 dashboard
// (build-3/dashboard.py PRICES + cost()). Always an estimate.

// USD per million tokens: [name part, input, output, cache read]. First match
// wins, so specific names come first. Cache writes cost 1.25x input (5-minute
// cache) or 2x input (1-hour cache). Fast mode costs 2x.
const PRICES: [string, number, number, number][] = [
  ['fable-5-1', 10, 50, 0.25],
  ['mythos-5-1', 10, 50, 0.25],
  ['fable', 10, 50, 1.0],
  ['mythos', 10, 50, 1.0],
  ['opus-5-5', 4, 20, 0.2],
  ['opus-5', 5, 25, 0.5],
  ['opus-4-8', 5, 25, 0.5],
  ['opus-4-7', 5, 25, 0.5],
  ['opus-4-6', 5, 25, 0.5],
  ['opus-4-5', 5, 25, 0.5],
  ['opus', 15, 75, 1.5],
  ['sonnet-5', 2, 10, 0.2],
  ['sonnet', 3, 15, 0.3],
  ['haiku-5', 0.1, 0.5, 0.01],
  ['haiku-4', 1, 5, 0.1],
  ['3-5-haiku', 0.8, 4, 0.08],
  ['haiku-3-5', 0.8, 4, 0.08],
  ['haiku', 0.25, 1.25, 0.03]
]

// The `usage` object as the Anthropic API returns it (and Claude Code logs it).
export interface AnthropicUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_creation?: { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number }
  speed?: string
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function hasTokens(u: AnthropicUsage | null | undefined): boolean {
  if (!u) return false
  return (
    n(u.input_tokens) +
      n(u.output_tokens) +
      n(u.cache_read_input_tokens) +
      n(u.cache_creation_input_tokens) >
    0
  )
}

// Returns null when the model isn't in the table ("cost unknown", never a guess).
export function anthropicCost(model: string, u: AnthropicUsage | null | undefined): number | null {
  if (!hasTokens(u)) return 0
  const m = (model || '').toLowerCase()
  const row = PRICES.find(([part]) => m.includes(part))
  if (!row) return null
  const [, inp, out, cread] = row
  const w1h = n(u!.cache_creation?.ephemeral_1h_input_tokens)
  const w5m = Math.max(0, n(u!.cache_creation_input_tokens) - w1h)
  const usd =
    n(u!.input_tokens) * inp +
    n(u!.output_tokens) * out +
    n(u!.cache_read_input_tokens) * cread +
    w5m * inp * 1.25 +
    w1h * inp * 2
  return (usd * (u!.speed === 'fast' ? 2 : 1)) / 1e6
}
