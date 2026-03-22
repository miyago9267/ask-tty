/**
 * InteractiveBash — MCP tool that supports stdin
 *
 * Drop-in alternative to the built-in Bash tool for commands that need stdin.
 * Registered as a global MCP server so all Claude Code sessions can use it.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { spawn } from 'node:child_process'

const mcp = new McpServer({
  name: 'interactive-bash',
  version: '1.0.0',
})

mcp.tool(
  'InteractiveBash',
  'Execute a bash command with optional stdin input. Use this instead of the built-in Bash tool when a command requires stdin (e.g., sudo -S, ssh, gpg, yes/no prompts).',
  {
    command: z.string().describe('The bash command to execute'),
    stdin: z.string().optional().describe('Text to pipe into the command via stdin. For sudo, provide the password here.'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000, max: 300000)'),
  },
  async ({ command, stdin, timeout }) => {
    const timeoutMs = Math.min(timeout || 30000, 300000)

    try {
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
        const proc = spawn('bash', ['-c', command], {
          cwd: process.env.HOME,
          env: process.env,
          timeout: timeoutMs,
        })

        let stdout = ''
        let stderr = ''

        proc.stdout.on('data', (data) => { stdout += data.toString() })
        proc.stderr.on('data', (data) => { stderr += data.toString() })

        if (stdin) {
          proc.stdin.write(stdin)
          proc.stdin.end()
        } else {
          proc.stdin.end()
        }

        proc.on('close', (code) => {
          resolve({ stdout, stderr, exitCode: code ?? 1 })
        })

        proc.on('error', (err) => {
          reject(err)
        })
      })

      // Format output similar to built-in Bash tool
      let output = ''
      if (result.stdout) output += result.stdout
      if (result.stderr) {
        // Filter out sudo's "Password:" prompt from stderr
        const filtered = result.stderr
          .split('\n')
          .filter(line => !line.match(/^\[sudo\]|^Password:/))
          .join('\n')
          .trim()
        if (filtered) output += (output ? '\n' : '') + filtered
      }

      return {
        content: [{
          type: 'text',
          text: output || `(exit code ${result.exitCode})`,
        }],
        isError: result.exitCode !== 0,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text', text: `Error: ${msg}` }],
        isError: true,
      }
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await mcp.connect(transport)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
