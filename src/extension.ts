/**
 * extension.ts — Entry point for the Play & Waste VSCode extension.
 *
 * VSCode API concepts covered here:
 *  - ExtensionContext       : lifecycle, subscriptions, globalState, secrets
 *  - vscode.commands        : registerCommand, executeCommand
 *  - vscode.window          : showInformationMessage, createStatusBarItem, etc.
 *  - vscode.workspace       : getConfiguration
 *  - TreeDataProvider       : sidebar/activity-bar tree view
 *  - WebviewPanel           : full HTML/CSS/JS panels (where games live)
 */

import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { GamesTreeProvider } from "./providers/GamesTreeProvider";
import { StatusBarManager } from "./utils/StatusBarManager";
import { Logger } from "./utils/Logger";

// `activate` is called by VSCode the first time any activationEvent is triggered.
// For us that means: when the sidebar view becomes visible OR any command is run.
export function activate(context: vscode.ExtensionContext) {
  // ── Logger (Output Channel) ──────────────────────────────────────────────
  // An output channel is a named panel in the OUTPUT tab. Great for debugging.
  const logger = Logger.getInstance(context);
  logger.info("Play & Waste is now active!");

  // ── Status Bar ───────────────────────────────────────────────────────────
  // The status bar sits at the very bottom of the VSCode window.
  const statusBar = new StatusBarManager(context);
  statusBar.show();

  // ── Tree View (Sidebar) ──────────────────────────────────────────────────
  // TreeDataProvider feeds data into the Activity Bar panel we registered
  // in package.json under contributes.views.playAndWaste.
  const gamesProvider = new GamesTreeProvider(context);
  const treeView = vscode.window.createTreeView("playAndWaste.gamesView", {
    treeDataProvider: gamesProvider,
    showCollapseAll: true,
  });

  // ── Commands ─────────────────────────────────────────────────────────────
  // All command registrations are centralised in commands/index.ts.
  // Each returned Disposable must be pushed into context.subscriptions so
  // VSCode can clean them up when the extension is deactivated.
  const commandDisposables = registerCommands(context, gamesProvider, statusBar, logger);

  // ── Push everything into subscriptions ──────────────────────────────────
  // context.subscriptions is an array of Disposables. VSCode calls .dispose()
  // on each entry when the extension deactivates — this prevents memory leaks.
  context.subscriptions.push(treeView, ...commandDisposables);

  // ── globalState demo ─────────────────────────────────────────────────────
  // globalState persists small key-value data across VSCode sessions.
  const launches = (context.globalState.get<number>("launchCount") ?? 0) + 1;
  context.globalState.update("launchCount", launches);
  logger.info(`Extension launched ${launches} time(s) total.`);

  logger.info("All subsystems initialised. Ready to play!");
}

// `deactivate` is called when the extension is unloaded (e.g. VSCode closes).
// Usually you don't need to do anything here because subscriptions handle cleanup,
// but it's a good place for async teardown (close DB connections, etc.).
export function deactivate() {
  Logger.getInstance().info("Play & Waste deactivated. Goodbye!");
}
