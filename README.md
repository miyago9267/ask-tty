# ask-tty

Universal stdin proxy for Claude Code. Get passwords, confirmations, and interactive input through Telegram when the Bash tool can't handle stdin.

## Problem

Claude Code's Bash tool doesn't support interactive stdin. Commands like `sudo`, `ssh`, `gpg`, or anything requiring user input will hang and timeout.

## Solution

ask-tty bridges the gap:

```
Claude needs sudo password
  → Bash tool runs: echo $(ask-tty "sudo password" -s) | sudo -S <cmd>
  → ask-tty sends prompt to your Telegram
  → You reply with the password
  → ask-tty returns it via stdout
  → sudo gets the password, command executes
  → Password is auto-deleted from Telegram chat
```

Works from any Claude Code session — local, remote, or headless.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────┐
│ Claude Code │────▶│ ask-tty CLI │────▶│ Service  │
│ (Bash tool) │     │  (any host) │     │ (server) │
└─────────────┘     └─────────────┘     └────┬─────┘
                                             │
                                        Telegram API
                                             │
                                        ┌────▼─────┐
                                        │   You    │
                                        │ (phone)  │
                                        └──────────┘
```

**Three layers:**

| Layer | What | Where |
|-------|------|-------|
| Skill | Teaches Claude to use ask-tty for stdin | `~/.claude/skills/ask-tty/` |
| CLI | `ask-tty` script, calls the service | Each machine |
| Service | HTTP server, relays prompts via Telegram | Your server |

## Install (Claude Code Plugin)

```bash
claude plugin add miyago9267/ask-tty
```

This installs the **skill** only (teaches Claude to use ask-tty). You still need to set up the **service** and **CLI** below.

## Setup

### 1. Create a Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. `/newbot` → pick a name → save the token

### 2. Deploy the Service

```bash
git clone https://github.com/miyago9267/ask-tty.git
cd ask-tty
cp .env.example .env
# Edit .env with your bot token and a generated secret
bun install
bun run start
```

#### Get your Chat ID

Send any message to your bot, then check server logs — your chat ID will appear. Add it to `.env` as `OWNER_CHAT_ID`.

#### Set up the Webhook

Point your Telegram bot's webhook to your server:

```
https://your-server.com/telegram/webhook
```

Use nginx, Caddy, or any reverse proxy with HTTPS.

### 3. Install Client

```bash
./install.sh
```

This installs:
- `~/bin/ask-tty` — CLI script
- `~/.claude/skills/ask-tty/SKILL.md` — Claude Code skill

### 4. Configure Client

```bash
mkdir -p ~/.config/ask-tty
cat > ~/.config/ask-tty/config << EOF
ASK_TTY_URL=https://your-server.com/ask
ASK_TTY_SECRET=your-secret-from-env
EOF
chmod 600 ~/.config/ask-tty/config
```

Repeat on every machine where you use Claude Code.

## Usage

Once installed, Claude Code automatically uses ask-tty when stdin is needed (the skill is `alwaysApply: true`).

### Manual usage

```bash
# Password (auto-deletes from Telegram)
echo $(ask-tty "sudo password" --sensitive) | sudo -S systemctl restart nginx

# Confirmation
ANSWER=$(ask-tty "Delete all logs? (y/N)")

# General input
VALUE=$(ask-tty "Enter new hostname")

# With timeout
ask-tty "Approve deployment?" --timeout 300
```

### Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--sensitive` | `-s` | Auto-delete the reply from Telegram (for passwords) |
| `--timeout N` | `-t N` | Timeout in seconds (default: 120, max: 300) |

## Security

- Passwords marked `--sensitive` are deleted from Telegram immediately after receipt
- Shared secret authenticates requests to the service
- Only the configured `OWNER_CHAT_ID` can reply to prompts
- Passwords never enter Claude's context — they flow through ask-tty directly to the command

## Requirements

- **Service**: [Bun](https://bun.sh) runtime, server with HTTPS
- **Client**: `curl`, `jq` (optional, fallback to grep)
- **Claude Code**: v2.1.80+

## License

MIT
