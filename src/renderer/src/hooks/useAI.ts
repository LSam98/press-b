import { useState, useEffect, useCallback } from 'react'

export function useAI(projectRoot: string | null) {
  const [hasKey, setHasKey] = useState(false)
  const [brief, setBrief] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return { hasKey, brief, generatedAt, isGenerating, error, saveKey, generateBrief, refreshKeyStatus }
}
