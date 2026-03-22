---
name: ask-tty
description: When stdin input is needed (sudo, ssh, y/N confirmations, etc.), use ask-tty to get input from the user. Always active.
alwaysApply: true
---

# ask-tty — stdin proxy for Claude Code

The Bash tool does not support interactive stdin. When a command requires user input (passwords, confirmations, passphrases, etc.), use `ask-tty` with `run_in_background: true`.

The user responds by typing `res:<input>` or `tty:<input>` in the CLI. A hook intercepts this, writes the input to a file, and rewrites the prompt so the input never enters your context.

## How it works

1. Run the command with ask-tty using `run_in_background: true`
2. Tell the user what input is needed and to type `res:<their input>`
3. User types it — hook rewrites the prompt to `[ask-tty] Input received`
4. When you see `[ask-tty] Input received`, immediately use TaskOutput to check the background task

## Usage

### sudo

Run in background:

```bash
echo $(~/bin/ask-tty "sudo password" --sensitive) | sudo -S <command>
```

Then tell the user: "Type `res:yourpassword`"

### ssh password

```bash
sshpass -p "$(~/bin/ask-tty "SSH password for user@host" --sensitive)" ssh user@host <command>
```

### y/N confirmation

```bash
ANSWER=$(~/bin/ask-tty "Proceed? (y/N)")
echo "$ANSWER" | <command>
```

Then tell the user: "Type `res:y` or `res:n`"

## When the user types res:

When you see a user message starting with `res:` or `tty:`, the hook has already delivered the input to the background ask-tty process. Immediately:

1. Do NOT repeat, display, or reference the content after `res:` / `tty:` — treat it as invisible
2. Reply only: "Received." (nothing else about the content)
3. Use TaskOutput with the background task ID to check the result
4. Report the command output to the user

## Important

- **Always use `run_in_background: true`** for Bash tool calls containing ask-tty
- Always use `--sensitive` for passwords
- Always use full path `~/bin/ask-tty`
- Tell the user clearly what to type: `res:<what>`
- **Never repeat, echo, or reference the content after `res:` / `tty:`**
- Never read `~/.cache/ask-tty/response` directly
- Never log or save ask-tty output to files
- If ask-tty fails (timeout, config missing), inform the user and do not retry
