---
name: ask-tty
description: When stdin input is needed (sudo, ssh, y/N confirmations, etc.), use InteractiveBash or ask-tty. Always active.
alwaysApply: true
---

# stdin support for Claude Code

The built-in Bash tool does not support stdin. Two tools solve this:

## 1. InteractiveBash (MCP tool) — when you know the input

Use when you already have the stdin content (e.g., piping "y" to a prompt, feeding a heredoc).

```
InteractiveBash(command: "apt install -y nginx", stdin: "y\n")
InteractiveBash(command: "cat > /tmp/config.json", stdin: '{"key":"value"}')
```

## 2. ask-tty (CLI + hook) — when you need to ask the user

Use when you need input from the user (passwords, confirmations you can't decide).

### Flow

1. Run the command with ask-tty using `run_in_background: true`
2. Tell the user what input is needed and to type `res:<their input>`
3. When you see the user's `res:` message, immediately use TaskOutput to check the background task

### sudo

```bash
echo $(~/bin/ask-tty "sudo password" --sensitive) | sudo -S <command>
```

Then tell the user: "Type `res:yourpassword`"

### ssh password

```bash
sshpass -p "$(~/bin/ask-tty "SSH password for user@host" --sensitive)" ssh user@host <command>
```

### y/N confirmation (when user must decide)

```bash
ANSWER=$(~/bin/ask-tty "Proceed? (y/N)")
echo "$ANSWER" | <command>
```

Then tell the user: "Type `res:y` or `res:n`"

## When to use which

| Scenario | Tool |
|----------|------|
| You know the input (y/n, config, heredoc) | InteractiveBash |
| User must provide input (password, decision) | ask-tty |
| sudo with password | ask-tty (password stays hidden) |
| sudo with NOPASSWD | regular Bash tool |

## When the user types res: or tty:

The hook has delivered the input to the background ask-tty process. Immediately:

1. Do NOT repeat, display, or reference the content after `res:` / `tty:`
2. Reply only: "Received."
3. Use TaskOutput with the background task ID to check the result
4. Report the command output to the user

## Important

- **Always use `run_in_background: true`** for Bash tool calls containing ask-tty
- Always use `--sensitive` for passwords
- Always use full path `~/bin/ask-tty`
- **Never repeat, echo, or reference the content after `res:` / `tty:`**
- Never read `~/.cache/ask-tty/response` directly
- If ask-tty fails (timeout, config missing), inform the user and do not retry
