# koishi-plugin-chatluna-minecraft-bridge

[![npm](https://img.shields.io/npm/v/koishi-plugin-chatluna-minecraft-bridge?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-chatluna-minecraft-bridge)
[![MIT License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

让 ChatLuna Agent 模式的大模型通过 RCON 执行 Minecraft 服务器命令。

AI 可以在对话中自动查询服务器在线玩家、游戏时间、世界种子等信息，同时通过多层安全机制确保只有授权的命令能够被执行。

## 功能特点

- **ChatLuna 工具集成** — 注册为 ChatLuna Agent 模式的 LangChain StructuredTool，AI 可自动调用
- **多服务器支持** — 通过房间绑定将不同聊天频道映射到不同 Minecraft 服务器
- **多层安全防护**
  - Koishi 用户权限等级校验（基于 authority）
  - 房间白名单控制
  - 命令策略（正则白名单/黑名单，默认拒绝）
  - 内置高危命令硬拦截（op/ban/stop 等）
  - 每用户滑动窗口速率限制
- **审计日志** — JSON Lines 格式记录所有工具调用
- **Koishi 管理命令** — `mcrcon.status` 查看机器人状态

## 前置要求

| 依赖 | 说明 |
|------|------|
| [Koishi](https://koishi.chat/) v4.18+ | 机器人框架 |
| [koishi-plugin-chatluna](https://github.com/ChatLunaLab/chatluna) v1.3+ | ChatLuna 核心，提供 Agent 模式和工具注册 |
| [koishi-plugin-minecraft-adapter](https://github.com/johntime2005/koishi-plugin-minecraft-adapter) | Minecraft 适配器，通过鹊桥 V2 协议连接 Minecraft 服务器 |
| database 服务（推荐） | 如 `@koishijs/plugin-database-sqlite`，用于管理用户权限等级 |

## 安装

### 通过 Koishi 插件市场

在 Koishi 控制台的插件市场中搜索 `chatluna-minecraft-bridge` 并安装。

### 通过 npm

```bash
npm install koishi-plugin-chatluna-minecraft-bridge
```

## 配置说明

### 基础设置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 启用/禁用插件 |

### 房间绑定

将聊天房间（频道）映射到 Minecraft 服务器机器人。AI 在某个房间中执行命令时，会通过绑定关系找到对应的 Minecraft 机器人。

| 字段 | 类型 | 说明 |
|------|------|------|
| `room` | string | 房间/频道 ID，如 `minecraft:SurvivalServer` |
| `botSelfId` | string | Minecraft 适配器中配置的 bot selfId |

> `room` 的格式取决于消息来源平台。可以在 Koishi 控制台的「沙盒」或日志中查看 `session.channelId` 的值。

### 权限管理

基于 Koishi 内置用户权限体系（authority 0-5）的访问控制。

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `auth.minAuthority` | number | `3` | 使用工具所需的最低权限等级 |
| `auth.roomAllowlist` | string[] | `[]` | 房间白名单，留空允许所有已绑定房间 |

**权限等级参考：**

| 等级 | 含义 | 建议用途 |
|------|------|----------|
| 0 | 未授权用户 | 禁止使用 |
| 1 | 普通用户 | 适合开放场景 |
| 2 | 信任用户 | 适合半公开服务器 |
| 3 | 管理员（默认） | 推荐的安全设置 |
| 4-5 | 超级管理员 | 严格管控场景 |

> 需要 database 服务来管理用户权限。没有 database 时，所有用户的权限默认为 0，无法使用工具。

### 命令策略

采用**默认拒绝**策略：只有匹配允许列表的命令才能执行，拒绝列表优先级最高。

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `commandPolicy.allow` | string[] | `['^list$', '^time query ...', '^seed$']` | 允许的命令正则 |
| `commandPolicy.deny` | string[] | `['^(op\|deop\|ban\|...)\\b']` | 禁止的命令正则（优先） |

**执行顺序：**

1. 内置高危命令硬拦截 → 无条件拒绝
2. 匹配 deny 列表 → 拒绝
3. 匹配 allow 列表 → 允许
4. 都不匹配 → 拒绝（默认拒绝）

**内置高危命令（不可配置，始终拒绝）：**

`op`, `deop`, `ban`, `ban-ip`, `pardon`, `pardon-ip`, `whitelist reload/add/remove`, `stop`, `reload`, `kill @a/@e`, `execute ... run (op|deop|ban|stop|reload)`

**添加自定义允许规则示例：**

```
# 允许查看天气
^weather\s+(clear|rain|thunder)$

# 允许查看记分板
^scoreboard\s+objectives\s+list$

# 允许查看指定玩家信息
^data\s+get\s+entity\s+\w+$
```

### 速率限制

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `rateLimit.windowMs` | number | `60000` | 滑动窗口时长（毫秒） |
| `rateLimit.maxCallsPerUser` | number | `6` | 窗口内每用户最大调用次数 |

### 审计日志

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `audit.enabled` | boolean | `true` | 启用审计日志 |
| `audit.path` | string | `data/chatluna/minecraft-rcon-audit.log` | 日志文件路径 |

日志格式为 JSON Lines，每行一条记录：

```json
{"time":"2025-01-01T12:00:00.000Z","user":"123456","room":"minecraft:Survival","botSelfId":"mc-bot-1","command":"list","verdict":"allow","result":"There are 3/20 players online: Steve, Alex, Notch"}
```

## 管理命令

| 命令 | 说明 |
|------|------|
| `mcrcon.status` | 显示已连接的 Minecraft 机器人、绑定状态、策略摘要 |

## 使用流程

### 1. 安装并配置 Minecraft 适配器

确保 `koishi-plugin-minecraft-adapter` 已安装，并通过鹊桥 V2 WebSocket 连接到 Minecraft 服务器。在适配器中配置好 `selfId` 和服务器地址。

### 2. 配置房间绑定

在插件配置的「房间绑定」中添加映射。例如，将 QQ 群或 Discord 频道绑定到对应的 Minecraft 服务器。

### 3. 设置用户权限

通过 Koishi 的 `auth` 命令或数据库管理工具，为信任的用户设置足够的权限等级。

### 4. 在 ChatLuna Agent 对话中使用

当用户在已绑定的房间中使用 ChatLuna Agent 模式对话时，AI 会自动识别并使用 `minecraft_rcon` 工具来回答 Minecraft 服务器相关的问题。

**对话示例：**

```
用户: 服务器现在有多少人在线？
AI:   [调用 minecraft_rcon: list]
      服务器当前有 3/20 名玩家在线：Steve, Alex, Notch

用户: 现在是白天还是晚上？
AI:   [调用 minecraft_rcon: time query daytime]
      当前游戏时间为 6000 刻，大约是中午 12 点。

用户: 世界种子是什么？
AI:   [调用 minecraft_rcon: seed]
      世界种子为 -123456789。
```

## 安全架构

```
LLM 调用 minecraft_rcon 工具
         │
    [1] 内置高危命令硬拦截
         │
    [2] 房间绑定解析（找到对应 Bot）
         │
    [3] 房间白名单校验
         │
    [4] 命令策略校验（deny → allow → 默认拒绝）
         │
    [5] 用户速率限制
         │
    [6] 定位 Minecraft Bot 实例
         │
    [7] 执行命令（9 秒超时）
         │
    每一步均写入审计日志
```

## 许可证

[MIT](./LICENSE)
