/**
 * commands/index.ts — All command registrations in one place.
 *
 * VSCode API concepts covered here:
 *  - vscode.commands.registerCommand   : wire a string ID to a callback
 *  - vscode.window.showInformationMessage / showWarningMessage / showErrorMessage
 *  - vscode.window.showQuickPick       : fuzzy-searchable dropdown list
 *  - vscode.window.showInputBox        : text input prompt
 *  - vscode.window.withProgress        : indeterminate / incremental progress UI
 *  - vscode.workspace.getConfiguration : read user/workspace settings
 *  - vscode.env.clipboard              : read/write system clipboard
 */

import * as vscode from "vscode";
import { GamesTreeProvider } from "../providers/GamesTreeProvider";
import { GamePanel } from "../panels/GamePanel";
import { TicTacToePanel } from "../panels/TicTacToePanel";
import { SnakePanel } from "../panels/SnakePanel";
import { SudokuPanel } from "../panels/SudokuPanel";
import { MemoryPanel } from "../panels/MemoryPanel";
import { StatusBarManager } from "../utils/StatusBarManager";
import { Logger } from "../utils/Logger";

export function registerCommands(
  context: vscode.ExtensionContext,
  gamesProvider: GamesTreeProvider,
  statusBar: StatusBarManager,
  logger: Logger
): vscode.Disposable[] {
  return [
    // ── 1. Hello World ────────────────────────────────────────────────────
    // The simplest possible command — shows a notification with action buttons.
    // showInformationMessage returns a Thenable that resolves to the clicked item.
    vscode.commands.registerCommand("playAndWaste.helloWorld", async () => {
      logger.info('Command "helloWorld" executed.');

      const config = vscode.workspace.getConfiguration("playAndWaste");
      const playerName = config.get<string>("playerName", "Player 1");

      const choice = await vscode.window.showInformationMessage(
        `Hello, ${playerName}! Ready to waste some time? 🎮`,
        "Open Games",
        "Change Name",
        "Dismiss"
      );

      if (choice === "Open Games") {
        vscode.commands.executeCommand("playAndWaste.openGamePanel");
      } else if (choice === "Change Name") {
        vscode.commands.executeCommand("playAndWaste.showInputBox");
      }
    }),

    // ── 2. Open Game Panel (WebviewPanel) ────────────────────────────────
    // WebviewPanel lets you render arbitrary HTML/CSS/JS inside VSCode.
    // This is where the actual games will live.
    vscode.commands.registerCommand("playAndWaste.openGamePanel", () => {
      logger.info('Command "openGamePanel" executed.');
      GamePanel.createOrShow(context);
    }),

    // ── 3. Quick Pick ─────────────────────────────────────────────────────
    // showQuickPick presents a searchable list. Each item can have a label,
    // description, detail, and icon (codicon or ThemeIcon).
    vscode.commands.registerCommand("playAndWaste.showQuickPick", async () => {
      logger.info('Command "showQuickPick" executed.');

      // Items can be plain strings or QuickPickItem objects.
      const games: vscode.QuickPickItem[] = [
        {
          label: "$(game) Tic Tac Toe",
          description: "Classic 3×3 grid",
          detail: "2 players — take turns marking X and O",
        },
        {
          label: "$(terminal) Snake",
          description: "Eat pellets, grow longer",
          detail: "Keyboard controlled — don't hit the walls!",
          // `picked` pre-selects this item when canPickMany is true
        },
        {
          label: "$(symbol-misc) Memory Match",
          description: "Flip cards to find pairs",
          detail: "Tests your short-term memory",
        },
        {
          label: "$(circle-outline) Coming Soon...",
          description: "More games on the way",
          // kind: vscode.QuickPickItemKind.Separator creates a visual separator
        },
      ];

      const selected = await vscode.window.showQuickPick(games, {
        title: "Play & Waste — Choose a Game",
        placeHolder: "Search for a game…",
        // matchOnDescription: also searches the description field
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (selected) {
        logger.info(`User selected: ${selected.label}`);
        vscode.window.showInformationMessage(
          `You picked: ${selected.label} — coming soon!`
        );
      }
    }),

    // ── 4. Input Box ──────────────────────────────────────────────────────
    // showInputBox prompts for a free-form text value with optional validation.
    vscode.commands.registerCommand("playAndWaste.showInputBox", async () => {
      logger.info('Command "showInputBox" executed.');

      const config = vscode.workspace.getConfiguration("playAndWaste");
      const current = config.get<string>("playerName", "Player 1");

      const name = await vscode.window.showInputBox({
        title: "Player Name",
        prompt: "What should we call you?",
        value: current,
        placeHolder: "Enter your gamer tag…",
        // validateInput runs on every keystroke. Return a string (error) or null (ok).
        validateInput(value) {
          if (!value.trim()) {
            return "Name cannot be empty";
          }
          if (value.length > 20) {
            return "Keep it under 20 characters";
          }
          return null; // null = valid
        },
      });

      if (name !== undefined) {
        // Update the workspace configuration (writes to settings.json)
        await config.update(
          "playerName",
          name.trim(),
          vscode.ConfigurationTarget.Global
        );
        statusBar.setPlayerName(name.trim());
        vscode.window.showInformationMessage(`Player name set to "${name.trim()}" ✅`);
        logger.info(`Player name updated to: ${name.trim()}`);
      }
    }),

    // ── 5. Progress notification ──────────────────────────────────────────
    // withProgress shows a progress indicator in the notification area,
    // the status bar, or a modal dialog depending on `location`.
    vscode.commands.registerCommand("playAndWaste.showProgress", async () => {
      logger.info('Command "showProgress" executed.');

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Loading game assets…",
          // cancellable: true adds a Cancel button; check token.isCancellationRequested
          cancellable: true,
        },
        async (progress, token) => {
          const steps = ["Sprites", "Sounds", "Leaderboard", "Game engine"];

          for (let i = 0; i < steps.length; i++) {
            if (token.isCancellationRequested) {
              logger.info("Progress cancelled by user.");
              vscode.window.showWarningMessage("Loading cancelled.");
              return;
            }

            // `increment` moves the bar forward; `message` updates the subtitle.
            progress.report({
              increment: 100 / steps.length,
              message: `${steps[i]}… (${i + 1}/${steps.length})`,
            });

            // Simulate async work (replace with real I/O later)
            await new Promise<void>((resolve) => setTimeout(resolve, 600));
          }

          vscode.window.showInformationMessage("All assets loaded! Let's play 🎉");
          logger.info("Progress demo completed.");
        }
      );
    }),

    // ── 6. Play Tic Tac Toe ──────────────────────────────────────────────
    vscode.commands.registerCommand("playAndWaste.playTicTacToe", () => {
      logger.info('Command "playTicTacToe" executed.');
      TicTacToePanel.createOrShow(context);
    }),

    // ── 7. Play Snake ────────────────────────────────────────────────────
    vscode.commands.registerCommand("playAndWaste.playSnake", () => {
      logger.info('Command "playSnake" executed.');
      SnakePanel.createOrShow(context);
    }),

    // ── 8. Play Sudoku ───────────────────────────────────────────────────
    vscode.commands.registerCommand("playAndWaste.playSudoku", () => {
      logger.info('Command "playSudoku" executed.');
      SudokuPanel.createOrShow(context);
    }),

    // ── 9. Play Memory Match ─────────────────────────────────────────────
    vscode.commands.registerCommand("playAndWaste.playMemory", () => {
      logger.info('Command "playMemory" executed.');
      MemoryPanel.createOrShow(context);
    }),

    // ── 10. Refresh Games tree ───────────────────────────────────────────
    vscode.commands.registerCommand("playAndWaste.refreshGames", () => {
      logger.info('Command "refreshGames" executed.');
      gamesProvider.refresh();
      vscode.window.showInformationMessage("Games list refreshed.");
    }),
  ];
}
