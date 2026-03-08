/**
 * utils/StatusBarManager.ts — Status Bar item.
 *
 * VSCode API concepts covered here:
 *  - vscode.window.createStatusBarItem : creates a clickable status bar widget
 *  - StatusBarAlignment                : Left / Right positioning
 *  - StatusBarItem.command             : run a command when the item is clicked
 *  - StatusBarItem.backgroundColor     : warning/error highlights
 *  - StatusBarItem.color               : custom text colour (ThemeColor)
 *  - Codicon syntax in text            : $(icon-name) inside .text strings
 */

import * as vscode from "vscode";

export class StatusBarManager {
  private readonly _item: vscode.StatusBarItem;
  private _playerName: string;

  constructor(context: vscode.ExtensionContext) {
    // Priority number: higher = closer to the left/right edge depending on alignment
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    const config = vscode.workspace.getConfiguration("playAndWaste");
    this._playerName = config.get<string>("playerName", "Player 1");

    this._updateText();

    // Clicking the status bar item runs this command
    this._item.command = "playAndWaste.showQuickPick";
    this._item.tooltip = "Play & Waste — click to pick a game";

    // Register so VSCode disposes it on deactivation
    context.subscriptions.push(this._item);
  }

  show(): void {
    const config = vscode.workspace.getConfiguration("playAndWaste");
    if (config.get<boolean>("enableStatusBar", true)) {
      this._item.show();
    }
  }

  hide(): void {
    this._item.hide();
  }

  setPlayerName(name: string): void {
    this._playerName = name;
    this._updateText();
  }

  // Call this to flash an error state (e.g., illegal move)
  flashError(message: string, durationMs = 2000): void {
    const prev = this._item.text;
    const prevBg = this._item.backgroundColor;

    this._item.text = `$(error) ${message}`;
    this._item.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground"
    );

    setTimeout(() => {
      this._item.text = prev;
      this._item.backgroundColor = prevBg;
    }, durationMs);
  }

  // Call this to show a temporary success state
  flashSuccess(message: string, durationMs = 2000): void {
    const prev = this._item.text;
    const prevBg = this._item.backgroundColor;

    this._item.text = `$(check) ${message}`;
    this._item.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground" // closest built-in "positive" colour
    );

    setTimeout(() => {
      this._item.text = prev;
      this._item.backgroundColor = prevBg;
    }, durationMs);
  }

  private _updateText(): void {
    // Codicons: $(icon-name) renders the matching icon inline with text
    this._item.text = `$(game) ${this._playerName}`;
  }
}
