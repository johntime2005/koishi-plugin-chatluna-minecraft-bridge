import { Config } from './config'

/**
 * These patterns match commands that are unconditionally blocked regardless of
 * the user-configured allow list. They are considered too dangerous to allow in
 * any configuration.
 */
const BUILTIN_HIGH_RISK_PATTERNS: RegExp[] = [
    /^op\b/i,
    /^deop\b/i,
    /^ban\b/i,
    /^ban-ip\b/i,
    /^pardon\b/i,
    /^pardon-ip\b/i,
    /^whitelist\s+(reload|add|remove)\b/i,
    /^stop\b/i,
    /^reload\b/i,
    /^kill\s+@[ae]\b/i,
    /^execute\b.*\brun\s+(op|deop|ban|stop|reload)\b/i
]

/**
 * Returns true when the command matches a built-in high-risk pattern.
 * These commands are rejected before the user-configured policy is consulted.
 */
export function isHighRisk(command: string): boolean {
    return BUILTIN_HIGH_RISK_PATTERNS.some((re) => re.test(command))
}

export type PolicyVerdict = 'allow' | 'deny'

/**
 * Compiled allow/deny regex lists derived from a Config instance.
 * Pre-compiling avoids reconstructing RegExp objects on every tool call.
 */
export interface CompiledPolicy {
    deny: RegExp[]
    allow: RegExp[]
}

/**
 * Compile the string patterns in a config into RegExp objects.
 * Call this once during plugin initialization.
 */
export function compilePolicy(config: Config): CompiledPolicy {
    return {
        deny: config.commandPolicy.deny.map((p) => new RegExp(p, 'i')),
        allow: config.commandPolicy.allow.map((p) => new RegExp(p, 'i'))
    }
}

/**
 * Evaluates the command against the compiled deny/allow lists.
 *
 * Evaluation order:
 *   1. If the command matches any deny pattern → deny.
 *   2. If the command matches any allow pattern → allow.
 *   3. Default → deny (default-deny posture).
 */
export function checkPolicy(command: string, policy: CompiledPolicy): PolicyVerdict {
    for (const re of policy.deny) {
        if (re.test(command)) {
            return 'deny'
        }
    }
    for (const re of policy.allow) {
        if (re.test(command)) {
            return 'allow'
        }
    }
    return 'deny'
}
