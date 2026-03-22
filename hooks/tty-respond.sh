#!/bin/bash
# UserPromptSubmit hook: intercept tty: or res: prefix
# Writes response to ~/.cache/ask-tty/response (local file IPC)
# Rewrites prompt so password never enters Claude's context

ASK_DIR="$HOME/.cache/ask-tty"

INPUT=$(cat)

# Try JSON, fallback to raw text
if command -v jq &> /dev/null && echo "$INPUT" | jq -e . >/dev/null 2>&1; then
  PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')
  IS_JSON=true
else
  PROMPT="$INPUT"
  IS_JSON=false
fi

# Check prefix
if [[ "$PROMPT" == tty:* ]]; then
  TTY_INPUT="${PROMPT#tty:}"
elif [[ "$PROMPT" == res:* ]]; then
  TTY_INPUT="${PROMPT#res:}"
else
  echo "$INPUT"
  exit 0
fi

if [ -z "$TTY_INPUT" ]; then
  echo "Usage: tty:<your input>" >&2
  exit 2
fi

# Check if something is waiting
if [ ! -f "$ASK_DIR/pending" ]; then
  echo "No pending ask-tty request." >&2
  exit 2
fi

# Write response to file (password stays here, never in Claude context)
echo "$TTY_INPUT" > "$ASK_DIR/response"

# Rewrite prompt to innocuous message and pass through (exit 0)
if [ "$IS_JSON" = true ]; then
  echo "$INPUT" | jq '.prompt = "[ask-tty] Input received. Check the background task for result."'
else
  echo "[ask-tty] Input received. Check the background task for result."
fi
exit 0
