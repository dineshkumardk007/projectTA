import 'server-only';
import { env } from '@/lib/env';

type LogLevel = 'info' | 'warn' | 'error';

interface LogPayload {
  message: string;
  code?: string;
  context?: Record<string, unknown>;
  error?: unknown;
}

function formatLog(level: LogLevel, payload: LogPayload) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    env: env.NODE_ENV,
    message: payload.message,
    ...(payload.code ? { code: payload.code } : {}),
    ...(payload.context ? { context: payload.context } : {}),
    ...(payload.error instanceof Error
      ? { error: { name: payload.error.name, message: payload.error.message, stack: payload.error.stack } }
      : payload.error
      ? { error: String(payload.error) }
      : {}),
  };

  if (env.NODE_ENV === 'development') {
    const prefix = level === 'error' ? '❌ [ERROR]' : level === 'warn' ? '⚠️ [WARN]' : 'ℹ️ [INFO]';
    return `${prefix} ${payload.message} ${payload.code ? `(${payload.code})` : ''}`;
  }

  return JSON.stringify(logEntry);
}

export const logger = {
  info(message: string, context?: Record<string, unknown>) {
    console.log(formatLog('info', { message, context }));
  },
  warn(message: string, context?: Record<string, unknown>) {
    console.warn(formatLog('warn', { message, context }));
  },
  error(message: string, error?: unknown, context?: Record<string, unknown>) {
    console.error(formatLog('error', { message, error, context }));
  },
};
