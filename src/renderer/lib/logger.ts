/** Simple renderer-side logger with levels and timestamps */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevel: LogLevel = import.meta.env.DEV ? 'debug' : 'info';

function format(level: LogLevel, module: string, ...args: unknown[]): string[] {
  const time = new Date().toISOString().slice(11, 23);
  return [`%c${time} %c${level.toUpperCase().padEnd(5)} %c[${module}]`,
    'color:#666', levelColor(level), 'color:#888', ...args.map(String)];
}

function levelColor(level: LogLevel): string {
  switch (level) {
    case 'debug': return 'color:#888';
    case 'info': return 'color:#4a9eff';
    case 'warn': return 'color:#ffb300';
    case 'error': return 'color:#dc4c3e';
  }
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function createLogger(module: string) {
  return {
    debug: (...args: unknown[]) => shouldLog('debug') && console.debug(...format('debug', module, ...args)),
    info: (...args: unknown[]) => shouldLog('info') && console.info(...format('info', module, ...args)),
    warn: (...args: unknown[]) => shouldLog('warn') && console.warn(...format('warn', module, ...args)),
    error: (...args: unknown[]) => shouldLog('error') && console.error(...format('error', module, ...args)),
  };
}

/** Default app logger */
export const log = createLogger('app');

/** Create a scoped logger for a module */
export function createLog(module: string) {
  return createLogger(module);
}

/** Set minimum log level */
export function setLogLevel(level: LogLevel) {
  minLevel = level;
}
