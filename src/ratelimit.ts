import { Config } from './config'

interface UserWindow {
    count: number
    windowStart: number
}

/**
 * A simple per-user sliding-window rate limiter backed by an in-memory Map.
 * Each RateLimiter instance is tied to one plugin lifecycle.
 * Expired entries are cleaned up periodically to prevent unbounded memory growth.
 */
export class RateLimiter {
    private readonly windows = new Map<string, UserWindow>()
    private cleanupTimer: ReturnType<typeof setInterval> | null = null

    constructor(private readonly config: Config) {
        // Sweep expired windows once per window duration to bound memory usage.
        this.cleanupTimer = setInterval(
            () => this.sweep(),
            this.config.rateLimit.windowMs
        )
        // Allow the process to exit even if the timer is still active.
        if (this.cleanupTimer.unref) {
            this.cleanupTimer.unref()
        }
    }

    /**
     * Returns true if the call is within the allowed rate, false if the user
     * has exceeded their quota for the current window.
     * Recording is done atomically: a call that is allowed is counted immediately.
     */
    allow(userId: string): boolean {
        const now = Date.now()
        const { windowMs, maxCallsPerUser } = this.config.rateLimit

        const existing = this.windows.get(userId)

        if (!existing || now - existing.windowStart >= windowMs) {
            this.windows.set(userId, { count: 1, windowStart: now })
            return true
        }

        if (existing.count >= maxCallsPerUser) {
            return false
        }

        existing.count++
        return true
    }

    /** Remove entries whose window has expired. */
    private sweep(): void {
        const now = Date.now()
        const windowMs = this.config.rateLimit.windowMs
        for (const [userId, win] of this.windows) {
            if (now - win.windowStart >= windowMs) {
                this.windows.delete(userId)
            }
        }
    }

    /** Cancel the cleanup timer (call on plugin dispose). */
    dispose(): void {
        if (this.cleanupTimer !== null) {
            clearInterval(this.cleanupTimer)
            this.cleanupTimer = null
        }
    }
}
