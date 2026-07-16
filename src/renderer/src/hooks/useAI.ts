import { useState, useEffect, useCallback } from 'react'
import { Suggestion, ChatMessage } from '../types'

export function useAI(projectRoot: string | null) {
  const [hasKey, setHasKey] = useState(false)
  const [brief, setBrief] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ask (project-aware chat)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isAsking, setIsAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)

  // Suggestions: null = not generated this session yet; [] = generated, none returned
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)

  // Check whether an API key is stored (on mount)
  const refreshKeyStatus = useCallback(async () => {
    try {
      const result = await window.pressB.ai.hasKey()
      setHasKey(result)
    } catch (e) {
      console.error('Error checking API key:', e)
    }
  }, [])

  useEffect(() => {
    refreshKeyStatus()
  }, [refreshKeyStatus])

  // Load the last persisted brief when the project changes (no API call).
  useEffect(() => {
    if (!projectRoot) {
      setBrief(null)
      setGeneratedAt(null)
      return
    }
    let cancelled = false
    window.pressB.ai
      .getBrief(projectRoot)
      .then((stored) => {
        if (cancelled) return
        setBrief(stored?.text ?? null)
        setGeneratedAt(stored?.generatedAt ?? null)
        setError(null)
      })
      .catch((e) => console.error('Error loading saved brief:', e))
    return () => {
      cancelled = true
    }
  }, [projectRoot])

  // Save (or clear) the API key, then refresh status
  const saveKey = useCallback(
    async (apiKey: string) => {
      await window.pressB.ai.setKey(apiKey)
      await refreshKeyStatus()
    },
    [refreshKeyStatus]
  )

  // Generate a re-entry brief for the current project
  const generateBrief = useCallback(async () => {
    if (!projectRoot) return
    setIsGenerating(true)
    setError(null)
    try {
      const result = await window.pressB.ai.generateBrief(projectRoot)
      if (result.success && result.brief) {
        setBrief(result.brief)
        setGeneratedAt(result.generatedAt ?? new Date().toISOString())
      } else {
        setError(result.error || 'Failed to generate brief.')
      }
    } catch (e) {
      setError((e as Error).message || 'Failed to generate brief.')
    } finally {
      setIsGenerating(false)
    }
  }, [projectRoot])

  // Clear suggestions when the project changes (they're project-specific & on-demand)
  useEffect(() => {
    setSuggestions(null)
    setSuggestError(null)
  }, [projectRoot])

  // Generate suggestions on demand
  const generateSuggestions = useCallback(async () => {
    if (!projectRoot) return
    setIsSuggesting(true)
    setSuggestError(null)
    try {
      const result = await window.pressB.ai.generateSuggestions(projectRoot)
      if (result.success) {
        setSuggestions((result.suggestions as Suggestion[]) || [])
      } else {
        setSuggestError(result.error || 'Failed to generate suggestions.')
      }
    } catch (e) {
      setSuggestError((e as Error).message || 'Failed to generate suggestions.')
    } finally {
      setIsSuggesting(false)
    }
  }, [projectRoot])

  // Dismiss a suggestion (remembered server-side so it won't recur) and drop it locally
  const dismissSuggestion = useCallback(
    async (suggestion: Suggestion) => {
      if (projectRoot) {
        await window.pressB.ai.dismissSuggestion(projectRoot, suggestion.title)
      }
      setSuggestions((prev) => (prev ? prev.filter((s) => s !== suggestion) : prev))
    },
    [projectRoot]
  )

  // Remove a suggestion locally without remembering it (used after Accept)
  const removeSuggestion = useCallback((suggestion: Suggestion) => {
    setSuggestions((prev) => (prev ? prev.filter((s) => s !== suggestion) : prev))
  }, [])

  // ── Ask (project-aware chat) ──────────────────────────────────────────────

  // Load the persisted conversation when the project changes (no API call)
  useEffect(() => {
    setAskError(null)
    if (!projectRoot) {
      setChatMessages([])
      return
    }
    let cancelled = false
    window.pressB.ai
      .getChat(projectRoot)
      .then((stored) => {
        if (!cancelled) setChatMessages(stored)
      })
      .catch((e) => console.error('Error loading saved chat:', e))
    return () => {
      cancelled = true
    }
  }, [projectRoot])

  // Streaming: append incoming deltas to the in-flight assistant message
  useEffect(() => {
    if (!projectRoot) return
    const unsubscribe = window.pressB.ai.onAskChunk(({ projectRoot: root, text }) => {
      if (root !== projectRoot) return // ignore chunks for another project
      setChatMessages((prev) => {
        if (prev.length === 0 || prev[prev.length - 1].role !== 'assistant') return prev
        const last = prev[prev.length - 1]
        return [...prev.slice(0, -1), { ...last, content: last.content + text }]
      })
    })
    return unsubscribe
  }, [projectRoot])

  // Ask a question: optimistic user msg + streaming assistant placeholder,
  // replaced by the authoritative answer when the invoke resolves.
  const ask = useCallback(
    async (question: string) => {
      const q = question.trim()
      if (!projectRoot || !q || isAsking) return
      setIsAsking(true)
      setAskError(null)
      setChatMessages((prev) => [
        ...prev,
        { role: 'user', content: q },
        { role: 'assistant', content: '' }
      ])
      try {
        const result = await window.pressB.ai.ask(projectRoot, q)
        if (result.success && result.answer !== undefined) {
          setChatMessages((prev) => {
            const copy = [...prev]
            if (copy.length && copy[copy.length - 1].role === 'assistant') {
              copy[copy.length - 1] = { role: 'assistant', content: result.answer as string }
            }
            return copy
          })
        } else {
          setAskError(result.error || 'Failed to get an answer.')
          // Drop the empty streaming placeholder; keep the user's question visible
          setChatMessages((prev) =>
            prev.length && prev[prev.length - 1].role === 'assistant' && prev[prev.length - 1].content === ''
              ? prev.slice(0, -1)
              : prev
          )
        }
      } catch (e) {
        setAskError((e as Error).message || 'Failed to get an answer.')
      } finally {
        setIsAsking(false)
      }
    },
    [projectRoot, isAsking]
  )

  // New chat: clear persisted + local conversation
  const clearChat = useCallback(async () => {
    if (!projectRoot) return
    try {
      await window.pressB.ai.clearChat(projectRoot)
    } catch (e) {
      console.error('Error clearing chat:', e)
    }
    setChatMessages([])
    setAskError(null)
  }, [projectRoot])

  return {
    hasKey,
    brief,
    generatedAt,
    isGenerating,
    error,
    saveKey,
    generateBrief,
    refreshKeyStatus,
    // suggestions
    suggestions,
    isSuggesting,
    suggestError,
    generateSuggestions,
    dismissSuggestion,
    removeSuggestion,
    // ask
    chatMessages,
    isAsking,
    askError,
    ask,
    clearChat
  }
}
