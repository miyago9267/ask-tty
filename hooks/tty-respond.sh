#!/bin/bash
# UserPromptSubmit hook: intercept /tty <input>
# Sends input to ask-tty service, blocks message from reaching Claude
# Password never enters Claude's context

# Read stdin (JSON from Claude Code)
INPUT=$(cat)

# Extract user prompt
if command -v jq &> /dev/null; then
  PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')
else
  PROMPT=$(echo "$INPUT" | grep -o '"prompt":"[^"]*"' | cut -d'"' -f4)
fi

# Check if prompt starts with /tty
if [[ "$PROMPT" != /tty* ]]; then
  # Not a /tty command — pass through
  echo "$INPUT"
  exit 0
fi

# Extract the input (everything after "/tty ")
TTY_INPUT="${PROMPT#/tty}"
TTY_INPUT="${TTY_INPUT# }"  # trim leading space

if [ -z "$TTY_INPUT" ]; then
  echo "Usage: /tty <your input>" >&2
  exit 2
fi

# Load config
CONFIG_FILE="${ASK_TTY_CONFIG:-$HOME/.config/ask-tty/config}"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "ask-tty config not found at $CONFIG_FILE" >&2
  exit 2
fi

# shellcheck source=/dev/null
source "$CONFIG_FILE"

if [ -z "$ASK_TTY_URL" ] || [ -z "$ASK_TTY_SECRET" ]; then
  echo "ASK_TTY_URL and ASK_TTY_SECRET required in $CONFIG_FILE" >&2
  exit 2
fi

# Build respond URL (replace /ask with /respond)
RESPOND_URL="${ASK_TTY_URL%/ask}/respond"

# Send response to service
if command -v jq &> /dev/null; then
  PAYLOAD=$(jq -n --arg secret "$ASK_TTY_SECRET" --arg reply "$TTY_INPUT" '{secret: $secret, reply: $reply}')
else
  ESC_INPUT=$(printf '%s' "$TTY_INPUT" | sed 's/\\/\\\\/g; s/"/\\"/g')
  PAYLOAD="{\"secret\":\"$ASK_TTY_SECRET\",\"reply\":\"$ESC_INPUT\"}"
fi

RESPONSE=$(curl -s -X POST "$RESPOND_URL" \
  -H 'Content-Type: application/json' \
  --max-time 5 \
  -d "$PAYLOAD")

# Check result
if command -v jq &> /dev/null; then
  OK=$(echo "$RESPONSE" | jq -r '.ok // empty')
else
  OK=$(echo "$RESPONSE" | grep -o '"ok":true')
fi

if [ -n "$OK" ]; then
  echo "Input sent." >&2
else
  echo "Failed to send input. Is ask-tty service running?" >&2
fi

# Exit 2 = block message from reaching Claude
exit 2
