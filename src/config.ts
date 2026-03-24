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
            .description('启用插件 / Enable the plugin'),
    }).description('基础设置'),

    Schema.object({
        roomBindings: Schema.array(
            Schema.object({
                room: Schema.string()
                    .required()
                    .description('房间/频道 ID（如 minecraft:SurvivalServer）'),
                botSelfId: Schema.string()
                    .required()
                    .description('绑定的 Minecraft 机器人 selfId'),
            })
        )
            .default([])
            .role('table')
            .description('将聊天房间映射到对应的 Minecraft 服务器机器人'),
    }).description('房间绑定'),

    Schema.object({
        auth: Schema.object({
            minAuthority: Schema.number()
                .min(0)
                .max(5)
                .default(3)
                .description(
                    '使用工具所需的最低用户权限等级（Koishi 内置 0-5 权限体系，默认 3 级）'
                ),
            roomAllowlist: Schema.array(Schema.string())
                .default([])
                .role('table')
                .description(
                    '允许使用工具的房间白名单（留空则允许所有已绑定房间）'
                ),
        }).description(
            '基于 Koishi 用户权限等级（authority）和房间白名单的双重校验'
        ),
    }).description('权限管理'),

    Schema.object({
        commandPolicy: Schema.object({
            allow: Schema.array(Schema.string())
                .default([
                    '^list$',
                    '^time query (daytime|gametime|day)$',
                    '^seed$',
                ])
                .role('table')
                .description(
                    '允许执行的命令正则（匹配完整命令字符串）'
                ),
            deny: Schema.array(Schema.string())
                .default([
                    '^(op|deop|ban|ban-ip|pardon|pardon-ip|whitelist|stop|reload)\\b',
                ])
                .role('table')
                .description(
                    '禁止执行的命令正则（优先于允许列表）'
                ),
        }).description(
            '默认拒绝策略 —— 仅匹配允许列表中模式的命令才能执行，拒绝列表优先级最高'
        ),
    }).description('命令策略'),

    Schema.object({
        rateLimit: Schema.object({
            windowMs: Schema.number()
                .min(1000)
                .default(60000)
                .description('滑动窗口时长（毫秒，默认 60000 即 1 分钟）'),
            maxCallsPerUser: Schema.number()
                .min(1)
                .default(6)
                .description('单用户在时间窗口内的最大调用次数'),
        }).description('基于滑动窗口的每用户速率限制'),
    }).description('速率限制'),

    Schema.object({
        audit: Schema.object({
            enabled: Schema.boolean()
                .default(true)
                .description('启用审计日志，记录每次工具调用'),
            path: Schema.string()
                .default('data/chatluna/minecraft-rcon-audit.log')
                .description('审计日志文件路径（JSON Lines 格式）'),
        }).description('记录所有 RCON 工具调用的详细信息，便于事后审计'),
    }).description('审计日志'),
]) as Schema<Config>
