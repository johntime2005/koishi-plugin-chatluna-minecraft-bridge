import { appendFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { Config } from './config'

export interface AuditEntry {
    /** ISO-8601 timestamp */
    time: string
    /** Koishi user ID */
    user: string
    /** Channel / room ID */
    room: string
    /** Minecraft bot selfId that was targeted (empty string when not resolved) */
    botSelfId: string
    /** Raw command string passed by the LLM */
    command: string
    /** Final decision: 'allow' | 'deny' | 'error' */
    verdict: string
    /** Short human-readable outcome description (truncated at 200 chars) */
    result: string
}

/**
 * Appends a single JSON-lines record to the configured audit log file.
 * Directory is created on first write. Write errors are silently swallowed so
 * that an audit failure never surfaces to the LLM or end-user.
 */
export function writeAudit(entry: AuditEntry, config: Config): void {
    if (!config.audit.enabled) return
    try {
        mkdirSync(dirname(config.audit.path), { recursive: true })
        appendFileSync(config.audit.path, JSON.stringify(entry) + '\n', 'utf8')
    } catch {
        // intentionally silent — audit should never break the tool call
    }
}
