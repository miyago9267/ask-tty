---
name: ask-tty
description: When stdin input is needed (sudo, ssh, y/N confirmations, etc.), use ask-tty to get input from the user via Telegram. Always active.
alwaysApply: true
---

# ask-tty — stdin proxy for Claude Code

The Bash tool does not support interactive stdin. When a command requires user input (passwords, confirmations, passphrases, etc.), use `ask-tty` to get it.

## Usage

### sudo

```bash
echo $(ask-tty "sudo password" --sensitive) | sudo -S <command>
```

### ssh password

```bash
sshpass -p "$(ask-tty "SSH password for user@host" --sensitive)" ssh user@host <command>
```

### y/N confirmation

```bash
ANSWER=$(ask-tty "Proceed with apt upgrade? (y/N)")
echo "$ANSWER" | sudo apt upgrade
```

### General input

```bash
VALUE=$(ask-tty "Enter the new hostname")
```

## Flags

- `--sensitive` / `-s`: Input will be auto-deleted from chat history (use for passwords)
- `--timeout N` / `-t N`: Timeout in seconds (default: 120)

## Rules

1. Always use `--sensitive` for passwords and secrets
2. Never log or save ask-tty output to files
3. Never include existing passwords in the prompt
4. ask-tty returns via stdout with no trailing newline
5. If ask-tty fails (timeout, config missing), inform the user and do not retry
