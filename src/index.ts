import { Context, Logger, Session } from 'koishi'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import type { CreateToolParams } from 'koishi-plugin-chatluna/llm-core/platform/types'
import type { BaseMessage } from '@langchain/core/messages'
import { Config } from './config'
import { RateLimiter } from './ratelimit'
import { MinecraftRconTool } from './tool/minecraft-rcon'

export { Config } from './config'

export const name = 'chatluna-minecraft-bridge'

export const inject = {
    required: ['chatluna'] as const,
    optional: ['database'] as const,
}

export const usage = `
## koishi-plugin-chatluna-minecraft-bridge

让 ChatLuna Agent 模式的大模型通过 RCON 执行 Minecraft 服务器命令。

### 前置要求

- **koishi-plugin-chatluna** — 已安装并启用 Agent 模式
- **koishi-plugin-minecraft-adapter** — 已安装并成功连接到 Minecraft 服务器（鹊桥 V2）
- **database 服务** — 用于 Koishi 用户权限管理（推荐）

### 快速开始

1. 在「房间绑定」中将聊天频道映射到 Minecraft 机器人
2. 在「权限管理」中设置允许使用工具的最低权限等级
3. 在「命令策略」中配置允许 AI 执行的命令白名单
4. 在 ChatLuna Agent 对话中，AI 将自动通过 RCON 查询 Minecraft 服务器

### 管理命令

- \`mcrcon.status\` — 查看机器人连接状态和绑定信息
`

/**
 * Tool description exposed to the LLM.
 * Extracted as a constant to avoid creating a tool instance just for the description string.
 */
const TOOL_DESCRIPTION =
    'Execute a read-only Minecraft server command via RCON. ' +
    'Only whitelisted commands are allowed (e.g. list, time query, seed). ' +
    'Use this to check server status such as online players, current in-game time, or world seed. ' +
    'Do NOT attempt destructive or administrative commands; they will be rejected.'

let logger: Logger

export function apply(ctx: Context, config: Config): void {
    if (!config.enabled) return

    logger = ctx.logger('chatluna-minecraft-bridge')

    const plugin = new ChatLunaPlugin(ctx, config, 'minecraft-bridge', false)
    const rateLimiter = new RateLimiter(config)
    ctx.on('dispose', () => rateLimiter.dispose())

    // ── Koishi 管理命令 ──────────────────────────────────────────────

    ctx.command('mcrcon', 'Minecraft RCON Bridge 管理')

    ctx.command('mcrcon.status', '查看 Minecraft 机器人连接状态')
        .action(() => {
            const mcBots = [...ctx.bots].filter(
                (b) => b.platform === 'minecraft'
            )

            if (mcBots.length === 0) {
                return (
                    '未发现已连接的 Minecraft 机器人。\n' +
                    '请确认 koishi-plugin-minecraft-adapter 已安装并正确配置。'
                )
            }

            const lines: string[] = ['Minecraft RCON Bridge 状态：', '']

            for (const bot of mcBots) {
                const bindings = config.roomBindings
                    .filter((b) => b.botSelfId === bot.selfId)
                    .map((b) => b.room)

                const statusText =
                    bot.status === 1
                        ? '在线'
                        : bot.status === 2
                          ? '连接中'
                          : bot.status === 4
                            ? '重连中'
                            : '离线'

                lines.push(`▸ Bot [${bot.selfId}]`)
                lines.push(`  状态: ${statusText}`)
                if (bindings.length > 0) {
                    lines.push(`  绑定房间: ${bindings.join(', ')}`)
                } else {
                    lines.push(`  未绑定任何房间`)
                }
                lines.push('')
            }

            lines.push(
                `命令策略: ${config.commandPolicy.allow.length} 条允许规则, ` +
                    `${config.commandPolicy.deny.length} 条拒绝规则`
            )
            lines.push(
                `速率限制: 每用户 ${config.rateLimit.maxCallsPerUser} 次 / ` +
                    `${config.rateLimit.windowMs / 1000} 秒`
            )
            lines.push(`审计日志: ${config.audit.enabled ? '已启用' : '已禁用'}`)

            return lines.join('\n')
        })

    // ── ChatLuna 工具注册 ────────────────────────────────────────────

    ctx.on('ready', async () => {
        plugin.registerTool('minecraft_rcon', {
            description: TOOL_DESCRIPTION,

            selector(_history: BaseMessage[]) {
                return true
            },

            authorization(session: Session) {
                // 基于 Koishi 用户权限等级检查（需要 database 服务）
                const authority: number =
                    (session.user as { authority?: number })?.authority ?? 0
                if (authority < config.auth.minAuthority) {
                    logger?.debug(
                        `authorization denied: user ${session.userId} authority ${authority} < ${config.auth.minAuthority}`
                    )
                    return false
                }

                // 房间白名单检查
                const room: string = session.event?.channel?.id ?? ''
                if (
                    config.auth.roomAllowlist.length > 0 &&
                    !config.auth.roomAllowlist.includes(room)
                ) {
                    logger?.debug(
                        `authorization denied: room ${room} not in allowlist`
                    )
                    return false
                }

                return true
            },

            createTool(_params: CreateToolParams) {
                return new MinecraftRconTool(ctx, config, rateLimiter)
            },
        })

        logger?.info('minecraft_rcon tool registered')
    })
}
