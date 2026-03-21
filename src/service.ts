/**
 * ask-tty service
 *
 * HTTP service that proxies stdin requests through Telegram.
 * Any Claude Code session can POST to /ask, the service sends the prompt
 * to the owner's Telegram, waits for reply, and returns it.
 */

import { Hono } from 'hono'
import { serve } from 'bun'
import { createTelegramClient, type TelegramUpdate } from './telegram'

// --- Config ---

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const WEBHOOK_PORT = Number(process.env.WEBHOOK_PORT) || 3847
const ASK_TTY_SECRET = process.env.ASK_TTY_SECRET || ''
const OWNER_CHAT_ID = Number(process.env.OWNER_CHAT_ID) || 0

if (!BOT_TOKEN) { console.error('TELEGRAM_BOT_TOKEN required'); process.exit(1) }
if (!ASK_TTY_SECRET) { console.error('ASK_TTY_SECRET required'); process.exit(1) }
if (!OWNER_CHAT_ID) { console.error('OWNER_CHAT_ID required'); process.exit(1) }

const telegram = createTelegramClient(BOT_TOKEN)

// --- Ask Queue ---

interface PendingAsk {
  prompt: string
  sensitive: boolean
  resolve: (reply: string) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const askQueue: PendingAsk[] = []

function hasPendingAsk(): boolean {
  return askQueue.length > 0
}

function sendAskPrompt(pending: PendingAsk) {
  const prefix = pending.sensitive ? '[sensitive — message will be deleted]\n' : ''
  telegram.sendMessage(OWNER_CHAT_ID, `${prefix}${pending.prompt}`)
}

function resolveNextAsk(reply: string, messageId: number) {
  const pending = askQueue.shift()
  if (!pending) return

  clearTimeout(pending.timer)

  if (pending.sensitive) {
    telegram.deleteMessage(OWNER_CHAT_ID, messageId)
  }

  pending.resolve(reply)

  // Send next prompt if queued
  if (askQueue.length > 0) {
    sendAskPrompt(askQueue[0])
  }
}

// --- HTTP Server ---

const app = new Hono()

// Core endpoint: receive stdin request, wait for Telegram reply
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

  const timeoutMs = Math.min(body.timeout || 120_000, 300_000) // max 5 min

  try {
    const reply = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = askQueue.findIndex((p) => p.resolve === resolve)
        if (idx >= 0) askQueue.splice(idx, 1)
        reject(new Error('Timed out waiting for input'))
      }, timeoutMs)

      const pending: PendingAsk = {
        prompt: body.prompt,
        sensitive: body.sensitive ?? false,
        resolve,
        reject,
        timer,
      }

      askQueue.push(pending)

      if (askQueue.length === 1) {
        sendAskPrompt(pending)
      }
    })

    return c.json({ reply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return c.json({ error: msg }, 408)
  }
})

// Telegram webhook: receive user replies
app.post('/telegram/webhook', async (c) => {
  const update = (await c.req.json()) as TelegramUpdate
  const message = update.message
  if (!message?.text || !message.from) return c.json({ ok: true })

  const chatId = message.chat.id
  const messageId = message.message_id

  // Only accept from owner
  if (chatId !== OWNER_CHAT_ID) return c.json({ ok: true })

  if (hasPendingAsk()) {
    resolveNextAsk(message.text, messageId)
  }
  // No pending ask — ignore (or extend with your own bot logic)

  return c.json({ ok: true })
})

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'ask-tty',
    pendingAsks: askQueue.length,
  }),
)

// Pairing helper: send a message to the bot, check server logs for your chat ID
app.get('/whoami', (c) =>
  c.text(
    'Send any message to your Telegram bot, then check server logs for your chat ID.\n' +
    'Set it as OWNER_CHAT_ID in .env.',
  ),
)

// --- Start ---

async function main() {
  serve({ fetch: app.fetch, port: WEBHOOK_PORT })
  console.log(`ask-tty service listening on port ${WEBHOOK_PORT}`)

  const webhookUrl = process.env.WEBHOOK_URL
  if (webhookUrl) {
    await telegram.setWebhook(webhookUrl)
    console.log(`Telegram webhook: ${webhookUrl}`)
  }

  const me = await telegram.getMe()
  console.log(`Bot: @${me.username} (${me.id})`)
  console.log(`Owner chat ID: ${OWNER_CHAT_ID}`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
