/**
 * Telegram Bot API — minimal client
 */

const BASE = 'https://api.telegram.org'

export interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from: { id: number; first_name: string; username?: string }
    chat: { id: number; type: string }
    text?: string
    date: number
  }
}

export interface TelegramClient {
  sendMessage(chatId: number, text: string): Promise<void>
  deleteMessage(chatId: number, messageId: number): Promise<void>
  setWebhook(url: string): Promise<void>
  getMe(): Promise<{ id: number; first_name: string; username: string }>
}

export function createTelegramClient(token: string): TelegramClient {
  async function api(method: string, body?: Record<string, unknown>) {
    const res = await fetch(`${BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string }
    if (!json.ok) throw new Error(`Telegram API ${method}: ${json.description}`)
    return json.result
  }

  return {
    async sendMessage(chatId: number, text: string) {
      const MAX = 4096
      for (let i = 0; i < text.length; i += MAX) {
        await api('sendMessage', { chat_id: chatId, text: text.slice(i, i + MAX) })
      }
    },
    async deleteMessage(chatId: number, messageId: number) {
      try {
        await api('deleteMessage', { chat_id: chatId, message_id: messageId })
      } catch {
        // Can't delete (>48h old or no permission) — skip
      }
    },
    async setWebhook(url: string) {
      await api('setWebhook', { url, allowed_updates: ['message'] })
    },
    async getMe() {
      return api('getMe') as Promise<{ id: number; first_name: string; username: string }>
    },
  }
}
