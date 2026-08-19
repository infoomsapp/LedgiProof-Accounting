// PATH: src/lib/command-bus.ts
//
// CQRS Command Bus — the single write gateway for LedgiProof.
//
// Every mutation that changes application state MUST flow through this bus:
//   commandBus.dispatch('transaction.create', payload)
//
// This enforces:
//   1. Named, auditable operations — no anonymous db.insert() calls
//   2. Consistent error normalization — all errors become CommandResult
//   3. A single interception point for cross-cutting concerns (quota, auth,
//      optimistic cache, analytics, dirty-marking)
//   4. Future-proofing — middleware, offline queuing, undo/redo, replay
//
// REGISTERING HANDLERS
// Each service module calls commandBus.register() once at module load time.
// Use the bootstrapCommands() helper in src/lib/commands.ts which imports
// all modules and causes their registrations to run.
//
// DISPATCHING
// From a React component, use the useCommand() hook which wraps dispatch()
// and ties into React Query invalidation + toast feedback.
// From a service function, await commandBus.dispatch() directly.

// ── Result type ────────────────────────────────────────────────────────────────

export type CommandResult<T = void> =
  | { ok: true;  data: T }
  | { ok: false; error: string }

export type CommandHandler<TPayload, TResult = void> = (
  payload: TPayload
) => Promise<CommandResult<TResult>>

// ── Middleware ─────────────────────────────────────────────────────────────────

export type CommandMiddleware = (
  type:    string,
  payload: unknown,
  next:    () => Promise<CommandResult<unknown>>
) => Promise<CommandResult<unknown>>

// ── Bus ────────────────────────────────────────────────────────────────────────

class CommandBus {
  private readonly registry    = new Map<string, CommandHandler<any, any>>()
  private readonly middlewares: CommandMiddleware[] = []

  // ── Registration ─────────────────────────────────────────────────────────

  register<TPayload, TResult = void>(
    type:    string,
    handler: CommandHandler<TPayload, TResult>
  ): void {
    if (this.registry.has(type)) {
      console.warn(`[CommandBus] Handler already registered for "${type}" — overwriting`)
    }
    this.registry.set(type, handler as CommandHandler<any, any>)
  }

  /** Add middleware that wraps every dispatch call. Added in LIFO order. */
  use(middleware: CommandMiddleware): void {
    this.middlewares.push(middleware)
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────

  async dispatch<TPayload, TResult = void>(
    type:    string,
    payload: TPayload
  ): Promise<CommandResult<TResult>> {
    const handler = this.registry.get(type)

    if (!handler) {
      const msg = `[CommandBus] No handler registered for command "${type}"`
      console.error(msg)
      return { ok: false, error: msg }
    }

    // Build the middleware chain (innermost = actual handler)
    const invoke = (): Promise<CommandResult<unknown>> =>
      (handler(payload) as Promise<CommandResult<unknown>>).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[CommandBus] Command "${type}" threw:`, err)
        return { ok: false, error: message } as CommandResult<unknown>
      })

    const chain = [...this.middlewares].reverse().reduce<() => Promise<CommandResult<unknown>>>(
      (next, mw) => () => mw(type, payload, next),
      invoke
    )

    try {
      return (await chain()) as CommandResult<TResult>
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[CommandBus] Middleware error for "${type}":`, err)
      return { ok: false, error: message }
    }
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  hasHandler(type: string): boolean {
    return this.registry.has(type)
  }

  registeredCommands(): string[] {
    return [...this.registry.keys()]
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────

export const commandBus = new CommandBus()

// ── Logging middleware (dev only) ──────────────────────────────────────────────

if (import.meta.env.DEV) {
  commandBus.use(async (type, payload, next) => {
    const t0 = performance.now()
    const result = await next()
    const ms = (performance.now() - t0).toFixed(1)
    if (result.ok) {
      console.debug(`[CMD] ✓ ${type} (${ms}ms)`)
    } else {
      console.warn(`[CMD] ✗ ${type} (${ms}ms) — ${result.error}`)
    }
    return result
  })
}
