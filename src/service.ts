/**
 * ask-tty service
 *
 * Core HTTP service that proxies stdin requests for Claude Code's Bash tool.
 * Provides /ask (for CLI script) and /respond (for any notification adapter).
 *
 * Without an adapter: use the built-in web UI at /pending to see and respond to prompts.
 * With an adapter (Telegram, Discord, etc.): prompts are pushed to the adapter,
 * responses come back via /respond or adapter-specific webhook.
 */

import { Hono } from 'hono'
import { serve } from 'bun'

// --- Config ---

const WEBHOOK_PORT = Number(process.env.WEBHOOK_PORT) || 3847
const ASK_TTY_SECRET = process.env.ASK_TTY_SECRET || ''
const ADAPTER = process.env.ASK_TTY_ADAPTER || ''  // 'telegram' | '' (none)

if (!ASK_TTY_SECRET) { console.error('ASK_TTY_SECRET required'); process.exit(1) }

// --- Ask Queue (core) ---

export interface PendingAsk {
  id: string
  prompt: string
  sensitive: boolean
  createdAt: number
  resolve: (reply: string) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export const askQueue: PendingAsk[] = []

let idCounter = 0
function nextId(): string {
  return `ask-${Date.now()}-${++idCounter}`
}

export function hasPendingAsk(): boolean {
  return askQueue.length > 0
}

export function resolveAskById(id: string, reply: string): boolean {
  const idx = askQueue.findIndex((p) => p.id === id)
  if (idx < 0) return false
  const pending = askQueue.splice(idx, 1)[0]
  clearTimeout(pending.timer)
  pending.resolve(reply)
  return true
}

export function resolveNextAsk(reply: string): boolean {
  const pending = askQueue.shift()
  if (!pending) return false
  clearTimeout(pending.timer)
  pending.resolve(reply)
  return true
}

// Adapter hook: called when a new ask is enqueued
export let onNewAsk: ((ask: PendingAsk) => void) | null = null

export function setOnNewAsk(handler: (ask: PendingAsk) => void) {
  onNewAsk = handler
}

// --- HTTP Server ---

const app = new Hono()

// Core: receive stdin request from ask-tty CLI
app.post('/ask', async (c) => {
  const body = (await c.req.json()) as {
    prompt: string
    secret: string
    sensitive?: boolean
    timeout?: number
  }

  if (body.secret !== ASK_TTY_SECRET) {
    return c.json({ error: 'unauthorized' }, 403)
  }

  if (!body.prompt?.trim()) {
    return c.json({ error: 'prompt is required' }, 400)
  }

  const timeoutMs = Math.min(body.timeout || 120_000, 300_000)

  try {
    const reply = await new Promise<string>((resolve, reject) => {
      const id = nextId()

      const timer = setTimeout(() => {
        const idx = askQueue.findIndex((p) => p.id === id)
        if (idx >= 0) askQueue.splice(idx, 1)
        reject(new Error('Timed out waiting for input'))
      }, timeoutMs)

      const pending: PendingAsk = {
        id,
        prompt: body.prompt,
        sensitive: body.sensitive ?? false,
        createdAt: Date.now(),
        resolve,
        reject,
        timer,
      }

      askQueue.push(pending)

      // Notify adapter (if any)
      if (onNewAsk) onNewAsk(pending)
    })

    return c.json({ reply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return c.json({ error: msg }, 408)
  }
})

// Core: respond to a pending ask (used by adapters or web UI)
app.post('/respond', async (c) => {
  const body = (await c.req.json()) as {
    secret: string
    id?: string
    reply: string
  }

  if (body.secret !== ASK_TTY_SECRET) {
    return c.json({ error: 'unauthorized' }, 403)
  }

  let resolved: boolean
  if (body.id) {
    resolved = resolveAskById(body.id, body.reply)
  } else {
    resolved = resolveNextAsk(body.reply)
  }

  return c.json({ ok: resolved })
})

// Core: list pending asks (for web UI or debugging)
app.get('/pending', (c) => {
  const secret = c.req.query('secret')
  if (secret !== ASK_TTY_SECRET) {
    return c.json({ error: 'unauthorized' }, 403)
  }

  return c.json(
    askQueue.map((p) => ({
      id: p.id,
      prompt: p.prompt,
      sensitive: p.sensitive,
      createdAt: p.createdAt,
    })),
  )
})

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'ask-tty',
    adapter: ADAPTER || 'none',
    pendingAsks: askQueue.length,
  }),
)

// --- Adapter Loading ---

async function loadAdapter() {
  if (ADAPTER === 'telegram') {
    const { initTelegramAdapter } = await import('./adapters/telegram')
    initTelegramAdapter(app)
    console.log('Telegram adapter loaded')
  }
  // Future: else if (ADAPTER === 'discord') { ... }
}

// --- Start ---

async function main() {
  await loadAdapter()

  serve({ fetch: app.fetch, port: WEBHOOK_PORT })
  console.log(`ask-tty service listening on port ${WEBHOOK_PORT}`)
  console.log(`Adapter: ${ADAPTER || 'none (use /pending + /respond)'}`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
