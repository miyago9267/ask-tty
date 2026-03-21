#!/bin/bash
# ask-tty installer
# Installs the CLI script and Claude Code skill

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing ask-tty..."

# 1. Install CLI to ~/bin/
mkdir -p ~/bin
cp "$SCRIPT_DIR/bin/ask-tty" ~/bin/ask-tty
chmod +x ~/bin/ask-tty
echo "  CLI installed to ~/bin/ask-tty"

# 2. Check PATH
if [[ ":$PATH:" != *":$HOME/bin:"* ]]; then
  echo "  Warning: ~/bin is not in your PATH"
  echo "  Add this to your shell profile: export PATH=\"\$HOME/bin:\$PATH\""
fi

# 3. Install Claude Code skill
SKILL_TARGETS=(
  "$HOME/.claude/skills/ask-tty"
  "$HOME/dotfile/claude/skills/ask-tty"
)

INSTALLED=false
for target in "${SKILL_TARGETS[@]}"; do
  parent="$(dirname "$target")"
  if [ -d "$parent" ]; then
    mkdir -p "$target"
    cp "$SCRIPT_DIR/skill/SKILL.md" "$target/SKILL.md"
    echo "  Skill installed to $target"
    INSTALLED=true
  fi
done

if [ "$INSTALLED" = false ]; then
  mkdir -p "$HOME/.claude/skills/ask-tty"
  cp "$SCRIPT_DIR/skill/SKILL.md" "$HOME/.claude/skills/ask-tty/SKILL.md"
  echo "  Skill installed to ~/.claude/skills/ask-tty"
fi

# 4. Check config
CONFIG_FILE="$HOME/.config/ask-tty/config"
if [ ! -f "$CONFIG_FILE" ]; then
  echo ""
  echo "  Config not found. Create it:"
  echo ""
  echo "    mkdir -p ~/.config/ask-tty"
  echo "    cat > ~/.config/ask-tty/config << EOF"
  echo "    ASK_TTY_URL=https://your-server.com/ask"
  echo "    ASK_TTY_SECRET=your-secret"
  echo "    EOF"
  echo ""
fi

echo ""
echo "Done. See README.md for service setup."
