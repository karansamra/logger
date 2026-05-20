import type { LoggerConfig, LogTransport } from './types.js';

/**
 * Builds a `LoggerConfig` from environment variables.
 *
 * Consuming services set these env vars to control log behaviour
 * without changing any code:
 *
 *   APP_ENV            - 'development' | 'local' | 'qa' | 'staging' | 'production'
 *   LOG_SERVICE_NAME   - Prefix for log files and the `service` field in JSON logs
 *   LOG_LEVEL          - Pino level override ('debug', 'info', 'warn', 'error', 'fatal')
 *   LOG_TRANSPORT      - 'console' | 'file' | 'both' | 'console,file'
 *   LOG_ROTATION_DAYS  - How many days of log files to keep
 *   LOG_DIR            - Directory for log files (default: './logs')
 */
export const getLoggingConfig = (defaults?: {
  serviceName?: string;
}): LoggerConfig => {
  const environment = process.env['APP_ENV'] ?? 'development';
  const serviceName =
    process.env['LOG_SERVICE_NAME'] ?? defaults?.serviceName ?? 'app';

  const envDefaults: Record<string, Partial<LoggerConfig>> = {
    development: {
      level: 'debug',
      transport: 'console',
      rotationDays: 3,
      enableRedaction: true,
    },
    local: {
      level: 'debug',
      transport: 'console',
      rotationDays: 3,
      enableRedaction: true,
    },
    qa: {
      level: 'info',
      transport: 'console,file',
      rotationDays: 7,
      enableRedaction: true,
    },
    staging: {
      level: 'info',
      transport: 'console,file',
      rotationDays: 7,
      enableRedaction: true,
    },
    production: {
      level: 'error',
      transport: 'file',
      rotationDays: 14,
      enableRedaction: true,
    },
  };

  const envConfig = envDefaults[environment] ?? envDefaults['development']!;

  return {
    service: serviceName,
    environment,
    level: process.env['LOG_LEVEL'] ?? envConfig.level ?? 'info',
    transport: (process.env['LOG_TRANSPORT'] as LogTransport) ?? envConfig.transport ?? 'console',
    rotationDays: Number.parseInt(
      process.env['LOG_ROTATION_DAYS'] ?? String(envConfig.rotationDays ?? 7)
    ),
    enableRedaction: envConfig.enableRedaction ?? true,
    logsDir: process.env['LOG_DIR'] ?? './logs',
  };
};
