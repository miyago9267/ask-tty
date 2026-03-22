# ask-tty — stdin proxy for Claude Code

## Overview

Claude Code 的 Bash tool 不支援互動式 stdin。ask-tty 透過 file-based IPC + UserPromptSubmit hook 解決這個問題，讓使用者在 CLI 中直接提供密碼、確認等輸入，不鎖住介面、不讓密碼顯示在對話中。

## Why

- `sudo`, `ssh`, `gpg` 等指令需要 stdin 輸入，Bash tool 會 hang
- 使用者應該能在 CLI 直接輸入，不需切換到其他 app
- 密碼不應被 Claude 複述或顯示

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌────────────────────┐
│ Claude Code │────▶│ ask-tty CLI │────▶│ ~/.cache/ask-tty/  │
│ (Bash, bg)  │     │ (polls file)│     │  pending / response│
└─────────────┘     └─────────────┘     └────────┬───────────┘
                                                  │
                    ┌─────────────┐               │
                    │ User types  │──── hook ─────▶│ writes response
                    │ res:input   │               │
                    └─────────────┘               │
                                                  │
                    ┌─────────────┐               │
                    │ Remote svc  │──── adapter ──▶│ writes response
                    │ (optional)  │               │
                    └─────────────┘
```

### Four Layers

| Layer | Component | Role |
|-------|-----------|------|
| Skill | `skills/ask-tty/SKILL.md` | 教 Claude 何時及如何使用 ask-tty |
| CLI | `bin/ask-tty` | 建 pending 檔、poll response、輸出到 stdout |
| Hook | `hooks/tty-respond.sh` | 攔截 `res:` / `tty:` 前綴、寫 response 檔 |
| Service | `src/service.ts` (optional) | Remote adapter，推播通知到 Telegram 等 |

### Key Decisions (ADR)

**ADR-1: Local file IPC 為預設**
- `~/.cache/ask-tty/` 做 IPC，sandbox-safe
- 不依賴任何 HTTP service，零 dependencies
- Remote service 是可選的額外通知通道

**ADR-2: UserPromptSubmit hook 無法改寫 prompt**
- 測試證實 hook stdout 不會改寫 prompt 內容
- 選擇 exit 0 放行，prompt 原樣到 Claude
- Skill 規定 Claude 不得複述 `res:` 後的內容

**ADR-3: 誰先回覆就用誰**
- Local hook (res:) 和 remote adapter (Telegram) 同時可用
- 兩者都寫同一個 response 檔
- 先到的 response 生效，ask-tty 立刻回傳

**ADR-4: run_in_background 避免 CLI 鎖死**
- 包含 ask-tty 的 Bash 指令必須用 `run_in_background: true`
- 否則 CLI 鎖住，使用者無法打 `res:`

**ADR-5: 密碼不顯示但技術上在 context**
- hook 無法改寫 prompt，密碼會到 Claude context
- Skill 規定 Claude 不得複述，只回「Received.」
- 對使用者而言密碼「不可見」

## File IPC Protocol

```
~/.cache/ask-tty/
  pending    — ask-tty 建立，內容為 prompt 文字
  sensitive  — ask-tty 建立（optional），標記為敏感輸入
  response   — hook 或 adapter 建立，內容為使用者回覆
```

Flow:
1. ask-tty 建 `pending`，清除 `response`
2. ask-tty poll `response`（0.1s 間隔）
3. hook 或 adapter 寫入 `response`
4. ask-tty 讀取 `response`，清除所有檔案，輸出到 stdout

## Plugin Structure

```
ask-tty/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── skills/ask-tty/SKILL.md    # auto-discovered
├── hooks/
│   ├── hooks.json             # auto-discovered
│   └── tty-respond.sh
├── bin/ask-tty                # manual install
├── src/
│   ├── service.ts             # optional remote service
│   └── adapters/telegram.ts   # optional Telegram adapter
├── install.sh
└── docs/specs/ask-tty/SPEC.md
```

## Security

- 密碼透過 file IPC 傳遞，不經過 HTTP（local mode）
- `~/.cache/ask-tty/response` 讀取後立即刪除
- Skill 禁止 Claude 複述 `res:` 內容
- Remote service 用 shared secret 認證
- Telegram adapter 的 `--sensitive` 輸入自動從聊天記錄刪除

## Supported Platforms

- macOS (tested)
- Linux (should work)
- Windows (needs PowerShell version of ask-tty script — not implemented)

## Not Doing

- 替換 Bash tool（不可能，是 Claude Code 內建的）
- 真正的 stdin pipe（Bash tool 不支援）
- 自動偵測哪些指令需要 stdin（交給 Claude 的 skill 判斷）
- Windows PowerShell 版（未來可做）
