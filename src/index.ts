import { Context, Logger } from 'koishi'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import type { CreateToolParams } from 'koishi-plugin-chatluna/llm-core/platform/types'
import type { BaseMessage } from '@langchain/core/messages'
import { Config } from './config'
import { RateLimiter } from './ratelimit'
import { MinecraftRconTool } from './tool/minecraft-rcon'

export * from './config'

let logger: Logger

export function apply(ctx: Context, config: Config): void {
    if (!config.enabled) return

    logger = ctx.logger('chatluna-minecraft-bridge')

    const plugin = new ChatLunaPlugin(ctx, config, 'minecraft-bridge', false)
    const rateLimiter = new RateLimiter(config)
    ctx.on('dispose', () => rateLimiter.dispose())

    ctx.on('ready', async () => {
        plugin.registerTool('minecraft_rcon', {
            description: new MinecraftRconTool(ctx, config, rateLimiter).description,

            selector(_history: BaseMessage[]) {
                // Activate for every session; fine-grained control is in authorization.
                return true
            },

            authorization(session) {
                // Reject if the user's authority level is below the configured minimum.
                const authority: number = (session.user as { authority?: number })?.authority ?? 0
                if (authority < config.auth.minAuthority) {
                    logger?.debug(
                        `[minecraft-bridge] authorization denied: user ${session.userId} has authority ${authority}, required ${config.auth.minAuthority}`
                    )
                    return false
                }

                // Reject if a room allowlist is configured and this room is not in it.
                const room: string = session.event?.channel?.id ?? ''
                if (
                    config.auth.roomAllowlist.length > 0 &&
                    !config.auth.roomAllowlist.includes(room)
                ) {
                    logger?.debug(
                        `[minecraft-bridge] authorization denied: room ${room} not in allowlist`
                    )
                    return false
                }

                return true
            },

            createTool(_params: CreateToolParams) {
                return new MinecraftRconTool(ctx, config, rateLimiter)
            }
        })

        logger?.info('[minecraft-bridge] minecraft_rcon tool registered')
    })
}
