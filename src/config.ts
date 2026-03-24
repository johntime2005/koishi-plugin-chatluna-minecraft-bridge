import { Schema } from 'koishi'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'

export interface RoomBinding {
    room: string
    botSelfId: string
}

export interface AuthConfig {
    minAuthority: number
    roomAllowlist: string[]
}

export interface CommandPolicy {
    allow: string[]
    deny: string[]
}

export interface RateLimitConfig {
    windowMs: number
    maxCallsPerUser: number
}

export interface AuditConfig {
    enabled: boolean
    path: string
}

export interface Config extends ChatLunaPlugin.Config {
    enabled: boolean
    roomBindings: RoomBinding[]
    auth: AuthConfig
    commandPolicy: CommandPolicy
    rateLimit: RateLimitConfig
    audit: AuditConfig
}

export const Config: Schema<Config> = Schema.intersect([
    ChatLunaPlugin.Config,

    Schema.object({
        enabled: Schema.boolean()
            .default(true)
            .description('Enable the Minecraft bridge'),

        roomBindings: Schema.array(
            Schema.object({
                room: Schema.string().description(
                    'Room/channel ID (e.g. minecraft:SurvivalServer)'
                ),
                botSelfId: Schema.string().description(
                    'Minecraft bot selfId to bind to this room'
                )
            })
        )
            .default([])
            .role('table')
            .description('Bindings from room ID to Minecraft bot selfId'),

        auth: Schema.object({
            minAuthority: Schema.number()
                .min(0)
                .default(3)
                .description('Minimum user authority level required to call the tool'),
            roomAllowlist: Schema.array(Schema.string())
                .default([])
                .role('table')
                .description(
                    'Allowed room IDs. Leave empty to allow all bound rooms.'
                )
        }).description('Authorization settings'),

        commandPolicy: Schema.object({
            allow: Schema.array(Schema.string())
                .default([
                    '^list$',
                    '^time query (daytime|gametime|day)$',
                    '^seed$'
                ])
                .role('table')
                .description(
                    'Allowed command patterns (regular expressions, matched against full command)'
                ),
            deny: Schema.array(Schema.string())
                .default(['^(op|deop|ban|ban-ip|pardon|pardon-ip|whitelist|stop|reload)\\b'])
                .role('table')
                .description(
                    'Denied command patterns (regular expressions). Takes priority over allow list.'
                )
        }).description('Command policy — default-deny, only allow-listed patterns are permitted'),

        rateLimit: Schema.object({
            windowMs: Schema.number()
                .min(1000)
                .default(60000)
                .description('Rate-limit sliding window in milliseconds'),
            maxCallsPerUser: Schema.number()
                .min(1)
                .default(6)
                .description('Maximum RCON calls per user within the window')
        }).description('Per-user rate limiting'),

        audit: Schema.object({
            enabled: Schema.boolean()
                .default(true)
                .description('Write audit log for every tool invocation'),
            path: Schema.string()
                .default('data/chatluna/minecraft-rcon-audit.log')
                .description('Path to the audit log file (JSON-lines format)')
        }).description('Audit logging')
    })
]) as Schema<Config>

export const inject = {
    required: ['chatluna']
}

export const name = 'chatluna-minecraft-bridge'
