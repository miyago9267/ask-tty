/**
 * Telegram adapter for ask-tty
 *
 * Pushes prompts to Telegram, receives replies via webhook.
 * Optional — ask-tty works without this (use /pending + /respond instead).
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN  — from @BotFather
 *   OWNER_CHAT_ID       — your Telegram chat ID
 *   WEBHOOK_URL         — public URL for Telegram webhook
 */

import type { Hono } from 'hono'
import { setOnNewAsk, hasPendingAsk, resolveNextAsk, type PendingAsk } from '../service'

const BASE = 'https://api.telegram.org'

// --- Config ---

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const OWNER_CHAT_ID = Number(process.env.OWNER_CHAT_ID) || 0

if (!BOT_TOKEN) { console.error('TELEGRAM_BOT_TOKEN required for telegram adapter'); process.exit(1) }
if (!OWNER_CHAT_ID) { console.error('OWNER_CHAT_ID required for telegram adapter'); process.exit(1) }

// --- Telegram API ---

async function api(method: string, body?: Record<string, unknown>) {
  const res = await fetch(`${BASE}/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string }
  if (!json.ok) throw new Error(`Telegram API ${method}: ${json.description}`)
  return json.result
}

async function sendMessage(chatId: number, text: string) {
  const MAX = 4096
  for (let i = 0; i < text.length; i += MAX) {
    await api('sendMessage', { chat_id: chatId, text: text.slice(i, i + MAX) })
  }
}

async function deleteMessage(chatId: number, messageId: number) {
  try {
    await api('deleteMessage', { chat_id: chatId, message_id: messageId })
  } catch {
    // Can't delete (>48h or no permission) — skip
  }
}

async function setWebhook(url: string) {
  await api('setWebhook', { url, allowed_updates: ['message'] })
}

async function getMe() {
  return api('getMe') as Promise<{ id: number; first_name: string; username: string }>
}

// --- Adapter ---

let currentPendingAsk: PendingAsk | null = null

export function initTelegramAdapter(app: Hono) {
  // Push prompts to Telegram when enqueued
  setOnNewAsk((ask) => {
    currentPendingAsk = ask
    const prefix = ask.sensitive ? '[sensitive — message will be deleted]\n' : ''
    sendMessage(OWNER_CHAT_ID, `${prefix}${ask.prompt}`)
  })

  // Receive replies via Telegram webhook
  app.post('/telegram/webhook', async (c) => {
    const update = (await c.req.json()) as {
      message?: {
        message_id: number
        from: { id: number }
        chat: { id: number }
        text?: string
      }
    }

    const message = update.message
    if (!message?.text) return c.json({ ok: true })
    if (message.chat.id !== OWNER_CHAT_ID) return c.json({ ok: true })

    if (hasPendingAsk()) {
      const wasSensitive = currentPendingAsk?.sensitive ?? false
      resolveNextAsk(message.text)

      if (wasSensitive) {
        await deleteMessage(OWNER_CHAT_ID, message.message_id)
      }

      currentPendingAsk = null
    }

    return c.json({ ok: true })
  })

  // Register webhook + log bot info
  const webhookUrl = process.env.WEBHOOK_URL
  if (webhookUrl) {
    setWebhook(webhookUrl).then(() => console.log(`Telegram webhook: ${webhookUrl}`))
  }

  getMe().then((me) => console.log(`Telegram bot: @${me.username} (${me.id})`))
}
