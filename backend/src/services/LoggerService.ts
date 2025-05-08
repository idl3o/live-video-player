import fs from 'fs';
import path from 'path';

/**
 * Service for handling logging across the application
 */
export class LoggerService {
  private context: string;

  /**
   * Create a new logger instance
   * @param context The context for the logger (usually the class or module name)
   */
  constructor(context: string) {
    this.context = context;
  }

  /**
   * Format a log message with the context
   * @param message The message to log
   * @returns The formatted message
   */
  private formatMessage(message: string): string {
    return `[${this.context}] ${message}`;
  }

  /**
   * Log an info message
   * @param message The message to log
   * @param meta Optional metadata to log
   */
  public info(message: string, meta?: any): void {
    const formattedMessage = this.formatMessage(message);
    if (meta) {
      console.info(formattedMessage, meta);
    } else {
      console.info(formattedMessage);
    }
  }

  /**
   * Log a warning message
   * @param message The message to log
   * @param meta Optional metadata to log
   */
  public warn(message: string, meta?: any): void {
    const formattedMessage = this.formatMessage(message);
    if (meta) {
      console.warn(formattedMessage, meta);
    } else {
      console.warn(formattedMessage);
    }
  }

  /**
   * Log an error message
   * @param message The message to log
   * @param error Optional error to log
   */
  public error(message: string, error?: any): void {
    const formattedMessage = this.formatMessage(message);
    if (error) {
      console.error(formattedMessage, error);
    } else {
      console.error(formattedMessage);
    }
  }

  /**
   * Log a debug message
   * @param message The message to log
   * @param meta Optional metadata to log
   */
  public debug(message: string, meta?: any): void {
    if (process.env.DEBUG === 'true') {
      const formattedMessage = this.formatMessage(message);
      if (meta) {
        console.debug(formattedMessage, meta);
      } else {
        console.debug(formattedMessage);
      }
    }
  }
}