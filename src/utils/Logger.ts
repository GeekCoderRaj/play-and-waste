/**
 * utils/Logger.ts — Output Channel wrapper (singleton).
 *
 * VSCode API concepts covered here:
 *  - vscode.window.createOutputChannel : creates a named panel in the OUTPUT tab
 *  - OutputChannel.appendLine          : write a line of text
 *  - OutputChannel.show                : bring the OUTPUT tab into focus
 *  - OutputChannel.dispose             : cleanup
 *
 * The Output Channel is the extension's equivalent of console.log for the user.
 * It appears in the OUTPUT dropdown (View → Output) under the channel name.
 */

import * as vscode from "vscode";

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export class Logger {
  private static _instance: Logger | undefined;
  private readonly _channel: vscode.OutputChannel;

  private constructor(_context: vscode.ExtensionContext) {
    // The string "Play & Waste" appears in the OUTPUT channel dropdown
    this._channel = vscode.window.createOutputChannel("Play & Waste");
    _context.subscriptions.push(this._channel);
  }

  // ── Singleton access ───────────────────────────────────────────────────────
  static getInstance(context?: vscode.ExtensionContext): Logger {
    if (!Logger._instance) {
      if (!context) {
        throw new Error("Logger.getInstance() called before initialisation");
      }
      Logger._instance = new Logger(context);
    }
    return Logger._instance;
  }

  // ── Log helpers ───────────────────────────────────────────────────────────
  info(message: string): void  { this._log("INFO",  message); }
  warn(message: string): void  { this._log("WARN",  message); }
  error(message: string): void { this._log("ERROR", message); }
  debug(message: string): void { this._log("DEBUG", message); }

  // Reveal the Output panel so the user can see logs
  show(): void {
    this._channel.show(true); // true = preserve focus on editor
  }

  private _log(level: LogLevel, message: string): void {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
    this._channel.appendLine(`[${ts}] [${level}] ${message}`);

    if (level === "ERROR") {
      // Errors always surface the output panel automatically
      this._channel.show(true);
    }
  }
}
