import { createLogger, format, transports } from "winston";

const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: "jira-backend" },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, service, stack }) => {
          return `[${timestamp}] [${service}] ${level}: ${stack || message}`;
        })
      ),
    }),
  ],
});

export default logger;
