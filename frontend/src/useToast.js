import { useCallback, useRef, useState } from 'react'

/**
 * @param {number} durationMs
 * @returns {{ toast: null | { message: string, kind: string }, showToast: (msg: string, kind?: string) => void, dismiss: () => void }}
 */
export function useToast(durationMs = 4200) {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setToast(null)
  }, [])

  const showToast = useCallback(
    (message, kind = 'info') => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setToast({ message, kind })
      timerRef.current = setTimeout(() => {
        setToast(null)
        timerRef.current = null
      }, durationMs)
    },
    [durationMs],
  )

  return { toast, showToast, dismiss }
}
