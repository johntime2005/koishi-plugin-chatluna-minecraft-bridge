import { Config } from './config'

/**
 * Returns the botSelfId bound to the given room, or null if no binding exists.
 */
export function resolveBot(room: string, config: Config): string | null {
    const binding = config.roomBindings.find((b) => b.room === room)
    return binding?.botSelfId ?? null
}
