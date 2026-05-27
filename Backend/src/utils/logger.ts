import { createLogger, format, transports } from "winston";
import path from "path";

const LOG_DIR = path.resolve(process.cwd(), "logs");

const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: "jira-backend" },
  transports: [
    // All logs (info and above) → logs/combined.log
    new transports.File({
      filename: path.join(LOG_DIR, "combined.log"),
      maxsize: 5 * 1024 * 1024, // 5 MB per file
      maxFiles: 5,              // keep last 5 rotated files
      tailable: true,
    }),
    // Error-only logs → logs/error.log
    new transports.File({
      filename: path.join(LOG_DIR, "error.log"),
      level: "error",
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

export default logger;
