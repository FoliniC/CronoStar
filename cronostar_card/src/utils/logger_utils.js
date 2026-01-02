// cronostar_card/src/utils/logger_utils.js

export function log(level, isLoggingEnabled, ...args) {
    if (isLoggingEnabled) {
        switch (level) {
            case 'debug': console.debug('[CronoStar]', ...args); break;
            case 'info': console.info('[CronoStar]', ...args); break;
            case 'warn': console.warn('[CronoStar]', ...args); break;
            case 'error': console.error('[CronoStar]', ...args); break;
            default: console.log('[CronoStar]', ...args);
        }
    }
}