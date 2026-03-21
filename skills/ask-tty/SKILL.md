---
name: ask-tty
description: When stdin input is needed (sudo, ssh, y/N confirmations, etc.), use ask-tty to get input from the user. Always active.
alwaysApply: true
---

# ask-tty — stdin proxy for Claude Code

The Bash tool does not support interactive stdin. When a command requires user input (passwords, confirmations, passphrases, etc.), use `ask-tty` with `run_in_background: true`.

The user responds by typing `/tty <input>` in the CLI. A hook intercepts this so the input never enters your context.

## How it works

1. You run the command with ask-tty using `run_in_background: true`
2. Tell the user what input is needed and to type `/tty <their input>`
3. The hook sends their input to the ask-tty service
4. The background command receives it and completes

## Usage

### sudo

Run in background:

```bash
echo $(ask-tty "sudo password" --sensitive) | sudo -S <command>
```

Then tell the user: "I need your sudo password. Type: `tty:yourpassword`"

### ssh password

```bash
sshpass -p "$(ask-tty "SSH password for user@host" --sensitive)" ssh user@host <command>
```

### y/N confirmation

```bash
ANSWER=$(ask-tty "Proceed with apt upgrade? (y/N)")
echo "$ANSWER" | <command>
```

Then tell the user: "Confirm? Type: `tty:y` or `tty:n`"

## Important

- **Always use `run_in_background: true`** for Bash tool calls containing ask-tty, otherwise the CLI locks up
- Always use `--sensitive` for passwords
- Tell the user clearly what to type: `/tty <what>`
- Never log or save ask-tty output to files
- If ask-tty fails (timeout, config missing), inform the user and do not retry
