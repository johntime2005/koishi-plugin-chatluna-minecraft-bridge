import { StructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { Context } from 'koishi'
import type { ChatLunaToolRunnable } from 'koishi-plugin-chatluna/llm-core/platform/types'
import { Config } from '../config'
import { resolveBot } from '../binding'
import { isHighRisk, checkPolicy, compilePolicy, CompiledPolicy } from '../policy'
import { RateLimiter } from '../ratelimit'
import { writeAudit, AuditEntry } from '../audit'

/** Maximum milliseconds to wait for bot.executeCommand() before timing out. */
const COMMAND_TIMEOUT_MS = 9000

/** Maximum characters to store in the audit result summary. */
const AUDIT_RESULT_MAX_LEN = 200

const inputSchema = z.object({
    command: z
        .string()
        .min(1)
        .describe(
            'The Minecraft command to execute, WITHOUT a leading slash. ' +
                'For example: "list", "time query daytime", "seed".'
        )
})

/**
 * Minimal interface for the Minecraft adapter bot.
 * We only need `executeCommand`; other bot capabilities are irrelevant here.
 */
interface MinecraftBot {
    executeCommand(command: string): Promise<unknown>
}

function isMinecraftBot(bot: unknown): bot is MinecraftBot {
    return (
        typeof bot === 'object' &&
        bot !== null &&
        'executeCommand' in bot &&
        typeof (bot as Record<string, unknown>).executeCommand === 'function'
    )
}

export class MinecraftRconTool extends StructuredTool {
    name = 'minecraft_rcon'

    description =
        'Execute a read-only Minecraft server command via RCON. ' +
        'Only whitelisted commands are allowed (e.g. list, time query, seed). ' +
        'Use this to check server status such as online players, current in-game time, or world seed. ' +
        'Do NOT attempt destructive or administrative commands; they will be rejected.'

    schema = inputSchema

    private readonly policy: CompiledPolicy

    constructor(
        private readonly ctx: Context,
        private readonly config: Config,
        private readonly rateLimiter: RateLimiter
    ) {
        super({})
        this.policy = compilePolicy(config)
    }

    async _call(
        input: z.infer<typeof inputSchema>,
        _runManager: unknown,
        runtime: ChatLunaToolRunnable
    ): Promise<string> {
        const session = runtime?.configurable?.session
        const userId: string = session?.userId ?? 'unknown'
        const room: string = session?.event?.channel?.id ?? ''

        const command = input.command.trim()

        const baseEntry: AuditEntry = {
            time: new Date().toISOString(),
            user: userId,
            room,
            botSelfId: '',
            command,
            verdict: 'deny',
            result: ''
        }

        // 1. Block high-risk commands unconditionally before any other check.
        if (isHighRisk(command)) {
            const entry: AuditEntry = {
                ...baseEntry,
                verdict: 'deny',
                result: 'high-risk command rejected'
            }
            writeAudit(entry, this.config)
            return 'Command rejected: this command is classified as high-risk and cannot be executed.'
        }

        // 2. Resolve the bound bot for this room.
        const botSelfId = resolveBot(room, this.config)
        if (!botSelfId) {
            const entry: AuditEntry = {
                ...baseEntry,
                verdict: 'deny',
                result: `room not bound: ${room}`
            }
            writeAudit(entry, this.config)
            return `Command rejected: room "${room}" is not bound to any Minecraft bot. Please ask an administrator to configure a room binding.`
        }
        baseEntry.botSelfId = botSelfId

        // 3. Check room allowlist (if configured, only listed rooms are permitted).
        if (
            this.config.auth.roomAllowlist.length > 0 &&
            !this.config.auth.roomAllowlist.includes(room)
        ) {
            const entry: AuditEntry = {
                ...baseEntry,
                verdict: 'deny',
                result: `room not in allowlist: ${room}`
            }
            writeAudit(entry, this.config)
            return `Command rejected: room "${room}" is not in the authorized room list.`
        }

        // 4. Evaluate configured command policy (deny list → allow list → default deny).
        const verdict = checkPolicy(command, this.policy)
        if (verdict === 'deny') {
            const entry: AuditEntry = {
                ...baseEntry,
                verdict: 'deny',
                result: `command not in allowlist: ${command}`
            }
            writeAudit(entry, this.config)
            return `Command rejected: "${command}" does not match any allowed command pattern.`
        }

        // 5. Rate limit per user.
        if (!this.rateLimiter.allow(userId)) {
            const entry: AuditEntry = {
                ...baseEntry,
                verdict: 'deny',
                result: 'rate limit exceeded'
            }
            writeAudit(entry, this.config)
            return 'Command rejected: you have exceeded the rate limit. Please wait before issuing more commands.'
        }

        // 6. Locate the Minecraft bot instance.
        const rawBot = this.ctx.bots.find(
            (b) => b.platform === 'minecraft' && b.selfId === botSelfId
        )
        if (!rawBot || !isMinecraftBot(rawBot)) {
            const entry: AuditEntry = {
                ...baseEntry,
                verdict: 'deny',
                result: `bot not found or offline: ${botSelfId}`
            }
            writeAudit(entry, this.config)
            return `Command rejected: Minecraft bot "${botSelfId}" is not connected or does not support executeCommand.`
        }

        // 7. Execute the command with a timeout.
        try {
            const result = await Promise.race<unknown>([
                rawBot.executeCommand(command),
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () => reject(new Error('timeout')),
                        COMMAND_TIMEOUT_MS
                    )
                )
            ])

            const resultStr = String(result ?? '(no output)')
            const entry: AuditEntry = {
                ...baseEntry,
                verdict: 'allow',
                result: resultStr.slice(0, AUDIT_RESULT_MAX_LEN)
            }
            writeAudit(entry, this.config)
            return resultStr
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)

            if (message === 'timeout') {
                const entry: AuditEntry = {
                    ...baseEntry,
                    verdict: 'error',
                    result: `command timed out after ${COMMAND_TIMEOUT_MS}ms`
                }
                writeAudit(entry, this.config)
                return `Command timed out after ${COMMAND_TIMEOUT_MS / 1000} seconds. The server may be under load.`
            }

            const entry: AuditEntry = {
                ...baseEntry,
                verdict: 'error',
                result: message.slice(0, AUDIT_RESULT_MAX_LEN)
            }
            writeAudit(entry, this.config)
            return `Command execution failed: ${message}`
        }
    }
}
