# ask-tty

stdin proxy for Claude Code. When the Bash tool needs interactive input (passwords, confirmations, passphrases), ask-tty gets it from you.

## Problem

Claude Code's Bash tool doesn't support interactive stdin. Commands like `sudo`, `ssh`, `gpg`, or anything requiring user input will hang and timeout.

## Solution

ask-tty adds stdin support to the Bash tool through a three-layer architecture:

```
┌─────────────┐     ┌─────────────┐     ┌──────────┐     ┌──────────┐
│ Claude Code │────▶│ ask-tty CLI │────▶│ Service  │────▶│ Adapter  │
│ (Bash tool) │     │             │     │ (/ask)   │     │(optional)│
└─────────────┘     └─────────────┘     └────┬─────┘     └──────────┘
                                             │
                                        ┌────▼─────┐
                                        │   You    │
                                        └──────────┘
```

| Layer | What | Role |
|-------|------|------|
| **Skill** | Claude Code plugin | Teaches Claude to use ask-tty when stdin is needed |
| **CLI** | `ask-tty` script | Sends prompt to service, returns reply to stdout |
| **Service** | HTTP server | Queues prompts, waits for your reply |
| **Adapter** | Optional | Pushes prompts to external channels (Telegram, etc.) |

## Install (Claude Code Plugin)

```bash
claude plugin add miyago9267/ask-tty
```

This installs the **skill** — it teaches every Claude Code session to use ask-tty for stdin. You still need to set up the service and CLI below.

## Setup

### 1. Deploy the Service

```bash
git clone https://github.com/miyago9267/ask-tty.git
cd ask-tty
cp .env.example .env
# Set ASK_TTY_SECRET (generate with: openssl rand -hex 16)
bun install
bun run start
```

#### Without an adapter

The service works standalone. Check pending prompts and respond via HTTP:

```bash
# List pending prompts
curl "https://your-server.com/pending?secret=YOUR_SECRET"

# Respond to a prompt
curl -X POST https://your-server.com/respond \
  -H 'Content-Type: application/json' \
  -d '{"secret":"YOUR_SECRET","reply":"my-password"}'
```

#### With Telegram adapter

Set these in `.env`:

```
ASK_TTY_ADAPTER=telegram
TELEGRAM_BOT_TOKEN=your-bot-token    # from @BotFather
OWNER_CHAT_ID=your-chat-id           # send a message to bot, check logs
WEBHOOK_URL=https://your-server.com/telegram/webhook
```

Prompts will be pushed to your Telegram. Reply directly in chat.

### 2. Install CLI

```bash
./install.sh
```

Installs `~/bin/ask-tty` and the Claude Code skill.

### 3. Configure CLI

On every machine where you use Claude Code:

```bash
mkdir -p ~/.config/ask-tty
cat > ~/.config/ask-tty/config << EOF
ASK_TTY_URL=https://your-server.com/ask
ASK_TTY_SECRET=your-secret
EOF
chmod 600 ~/.config/ask-tty/config
```

## Usage

Once installed, Claude Code automatically uses ask-tty when stdin is needed.

```bash
# sudo (password auto-deleted from adapter if --sensitive)
echo $(ask-tty "sudo password" --sensitive) | sudo -S systemctl restart nginx

# Confirmation
ANSWER=$(ask-tty "Delete all logs? (y/N)")

# General input
VALUE=$(ask-tty "Enter new hostname")

# Custom timeout
ask-tty "Approve deployment?" --timeout 300
```

| Flag | Short | Description |
|------|-------|-------------|
| `--sensitive` | `-s` | Treat as secret (adapter may auto-delete) |
| `--timeout N` | `-t N` | Timeout in seconds (default: 120, max: 300) |

## API

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/ask` | POST | secret in body | Submit a prompt, blocks until replied |
| `/respond` | POST | secret in body | Reply to a pending prompt |
| `/pending` | GET | secret in query | List pending prompts |
| `/health` | GET | none | Service status |

## Writing an Adapter

Adapters hook into the service to push prompts to external channels. See `src/adapters/telegram.ts` as a reference.

An adapter:
1. Calls `setOnNewAsk(callback)` to receive new prompts
2. Registers a webhook route on the Hono app to receive replies
3. Calls `resolveNextAsk(reply)` when a reply arrives

## Security

- Passwords marked `--sensitive` are handled by the adapter (e.g., Telegram deletes the message)
- Shared secret authenticates all requests
- Passwords never enter Claude's context — they flow through ask-tty directly to the command
- Config files are chmod 600

## Requirements

- **Service**: [Bun](https://bun.sh), server with HTTPS (for adapters with webhooks)
- **CLI**: `curl`, `jq` (optional, has fallback)
- **Claude Code**: v2.1.80+

## License

MIT
