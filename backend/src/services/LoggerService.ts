import fs from 'fs';
import path from 'path';
import { format } from 'util';

enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL'
}

class LoggerService {
  private logDir: string;
  private logFile: string;
  private debugEnabled: boolean;
  
  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.logFile = path.join(this.logDir, `app-${new Date().toISOString().split('T')[0]}.log`);
    this.debugEnabled = process.env.DEBUG?.toLowerCase() === 'true' || false;
    
    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }
  
  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const formattedMeta = meta ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `[${timestamp}] [${level}] ${message}${formattedMeta}`;
  }
  
  private logToFile(message: string): void {
    fs.appendFileSync(this.logFile, `${message}\n`);
  }
  
  debug(message: string, meta?: any): void {
    if (!this.debugEnabled) return;
    const formattedMessage = this.formatMessage(LogLevel.DEBUG, message, meta);
    console.debug(formattedMessage);
    this.logToFile(formattedMessage);
  }
  
  info(message: string, meta?: any): void {
    const formattedMessage = this.formatMessage(LogLevel.INFO, message, meta);
    console.info(formattedMessage);
    this.logToFile(formattedMessage);
  }
  
  warn(message: string, meta?: any): void {
    const formattedMessage = this.formatMessage(LogLevel.WARN, message, meta);
    console.warn(formattedMessage);
    this.logToFile(formattedMessage);
  }
  
  error(message: string, error?: Error, meta?: any): void {
    const errorMeta = error ? {
      ...meta,
      errorMessage: error.message,
      stack: error.stack,
    } : meta;
    const formattedMessage = this.formatMessage(LogLevel.ERROR, message, errorMeta);
    console.error(formattedMessage);
    this.logToFile(formattedMessage);
  }
  
  fatal(message: string, error?: Error, meta?: any): void {
    const errorMeta = error ? {
      ...meta,
      errorMessage: error.message,
      stack: error.stack,
    } : meta;
    const formattedMessage = this.formatMessage(LogLevel.FATAL, message, errorMeta);
    console.error(formattedMessage);
    this.logToFile(formattedMessage);
  }
  
  getLogPath(): string {
    return this.logFile;
  }
}

// Export a singleton instance
export const logger = new LoggerService();
export default logger;