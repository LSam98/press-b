import { useState, useEffect, useCallback } from 'react'
import { Suggestion } from '../types'

export function useAI(projectRoot: string | null) {
  const [hasKey, setHasKey] = useState(false)
  const [brief, setBrief] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Suggestions: null = not generated this session yet; [] = generated, none returned
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)

  // Check whether an API key is stored (on mount)
  const refreshKeyStatus = useCallback(async () => {
    try {
      const result = await window.devfloat.ai.hasKey()
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
    window.devfloat.ai
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
      await window.devfloat.ai.setKey(apiKey)
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
      const result = await window.devfloat.ai.generateBrief(projectRoot)
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
      const result = await window.devfloat.ai.generateSuggestions(projectRoot)
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
        await window.devfloat.ai.dismissSuggestion(projectRoot, suggestion.title)
      }
      setSuggestions((prev) => (prev ? prev.filter((s) => s !== suggestion) : prev))
    },
    [projectRoot]
  )

  // Remove a suggestion locally without remembering it (used after Accept)
  const removeSuggestion = useCallback((suggestion: Suggestion) => {
    setSuggestions((prev) => (prev ? prev.filter((s) => s !== suggestion) : prev))
  }, [])

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
    removeSuggestion
  }
}
