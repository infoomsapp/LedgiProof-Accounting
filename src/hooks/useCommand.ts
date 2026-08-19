// PATH: src/hooks/useCommand.ts
//
// React hook wrapping the CQRS command bus for use inside components.
//
// Usage:
//   const { dispatch, pending } = useCommand()
//
//   async function handleSave() {
//     const result = await dispatch('transaction.create', {
//       orgId, amount, description, transactionDate, source: 'manual'
//     })
//     if (!result.ok) {
//       setError(result.error)
//     }
//   }
//
// The hook:
//   · Tracks in-flight state per command type (pending['transaction.create'])
//   · Never throws — always returns CommandResult
//   · Is thin: no toast, no React Query invalidation here; do that in the
//     calling component or in the command handler itself.

import { useCallback, useRef, useState } from 'react'
import { commandBus }                     from '../lib/command-bus'
import type { CommandResult }             from '../lib/command-bus'

interface UseCommand {
  dispatch: <TPayload, TResult = void>(
    type:    string,
    payload: TPayload
  ) => Promise<CommandResult<TResult>>
  pending:  Record<string, boolean>
  isPending: (type: string) => boolean
}

export function useCommand(): UseCommand {
  const [pending, setPending] = useState<Record<string, boolean>>({})
  // Stable ref so dispatch never changes identity across renders
  const pendingRef = useRef<Record<string, number>>({})

  const dispatch = useCallback(async <TPayload, TResult = void>(
    type:    string,
    payload: TPayload
  ): Promise<CommandResult<TResult>> => {
    // Increment in-flight counter for this command type
    pendingRef.current[type] = (pendingRef.current[type] ?? 0) + 1
    setPending(p => ({ ...p, [type]: true }))

    try {
      return await commandBus.dispatch<TPayload, TResult>(type, payload)
    } finally {
      pendingRef.current[type] = Math.max(0, (pendingRef.current[type] ?? 1) - 1)
      if (pendingRef.current[type] === 0) {
        setPending(p => {
          const next = { ...p }
          delete next[type]
          return next
        })
      }
    }
  }, [])

  const isPending = useCallback((type: string): boolean => {
    return pending[type] === true
  }, [pending])

  return { dispatch, pending, isPending }
}
