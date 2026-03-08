/**
 * panels/TicTacToePanel.ts — Tic Tac Toe game panel.
 *
 * Architecture:
 *  - Game state (board, scores, turn) lives entirely in the webview JS.
 *  - The webview sends messages to the extension when the game ends
 *    so VSCode can show native notifications.
 *  - The extension can send "reset" to the webview to restart the game.
 *
 * VSCode API concepts reinforced here:
 *  - WebviewPanel singleton pattern
 *  - Bi-directional postMessage / onDidReceiveMessage
 *  - CSS variables to match the user's VSCode theme
 *  - Nonce-based Content Security Policy
 */

import * as vscode from "vscode";

export class TicTacToePanel {
  private static _instance: TicTacToePanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (TicTacToePanel._instance) {
      TicTacToePanel._instance._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "playAndWaste.tictactoe",
      "Tic Tac Toe ⭕❌",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      }
    );

    TicTacToePanel._instance = new TicTacToePanel(panel, context);
  }

  private constructor(panel: vscode.WebviewPanel, _context: vscode.ExtensionContext) {
    this._panel = panel;

    this._panel.webview.html = this._getHtml();

    this._panel.webview.onDidReceiveMessage(
      (msg: { command: string; payload?: unknown }) => this._handleMessage(msg),
      undefined,
      this._disposables
    );

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
  }

  private _handleMessage(msg: { command: string; payload?: unknown }): void {
    switch (msg.command) {
      case "win": {
        const player = msg.payload as string;
        vscode.window
          .showInformationMessage(`🎉 Player ${player} wins!`, "Play Again", "Close")
          .then((choice) => {
            if (choice === "Play Again") {
              this._panel.webview.postMessage({ command: "reset" });
            } else if (choice === "Close") {
              this._panel.dispose();
            }
          });
        break;
      }
      case "draw":
        vscode.window
          .showInformationMessage("🤝 It's a draw!", "Play Again", "Close")
          .then((choice) => {
            if (choice === "Play Again") {
              this._panel.webview.postMessage({ command: "reset" });
            } else if (choice === "Close") {
              this._panel.dispose();
            }
          });
        break;
    }
  }

  private _getHtml(): string {
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tic Tac Toe</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
      padding: 2rem;
      user-select: none;
    }

    h1 {
      font-size: 1.6rem;
      letter-spacing: 0.05em;
    }

    /* ── Score board ──────────────────────────────────────────── */
    .scoreboard {
      display: flex;
      gap: 2rem;
      align-items: center;
    }

    .score-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      padding: 0.6rem 1.2rem;
      border-radius: 8px;
      border: 2px solid transparent;
      transition: border-color 0.2s, background 0.2s;
      min-width: 80px;
    }

    .score-card.active {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-editor-selectionBackground);
    }

    .score-card .symbol {
      font-size: 1.8rem;
      line-height: 1;
    }

    .score-card .name {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--vscode-descriptionForeground);
    }

    .score-card .points {
      font-size: 1.4rem;
      font-weight: 700;
    }

    .score-sep {
      font-size: 1.2rem;
      color: var(--vscode-descriptionForeground);
    }

    /* ── Status line ──────────────────────────────────────────── */
    #status {
      font-size: 1rem;
      color: var(--vscode-descriptionForeground);
      min-height: 1.4em;
      transition: color 0.2s;
    }

    #status.win  { color: var(--vscode-terminal-ansiGreen); font-weight: 600; }
    #status.draw { color: var(--vscode-terminal-ansiYellow); font-weight: 600; }

    /* ── Board ────────────────────────────────────────────────── */
    .board {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .cell {
      width: 100px;
      height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.8rem;
      font-weight: 700;
      border-radius: 10px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 2px solid var(--vscode-panel-border);
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, transform 0.1s;
    }

    .cell:hover:not(.taken) {
      background: var(--vscode-editor-selectionBackground);
      border-color: var(--vscode-focusBorder);
      transform: scale(1.04);
    }

    .cell.taken { cursor: default; }

    .cell.X { color: #4fc3f7; } /* light blue  */
    .cell.O { color: #ef9a9a; } /* light red   */

    .cell.winner {
      background: var(--vscode-editor-selectionHighlightBackground);
      border-color: var(--vscode-terminal-ansiGreen);
      animation: pulse 0.6s ease infinite alternate;
    }

    @keyframes pulse {
      from { transform: scale(1);    box-shadow: none; }
      to   { transform: scale(1.06); box-shadow: 0 0 12px var(--vscode-terminal-ansiGreen); }
    }

    /* ── Button ───────────────────────────────────────────────── */
    button {
      padding: 0.5rem 1.5rem;
      border-radius: 6px;
      border: none;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 0.9rem;
      cursor: pointer;
      transition: background 0.15s;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <h1>⭕ Tic Tac Toe ❌</h1>

  <div class="scoreboard">
    <div class="score-card active" id="card-X">
      <span class="symbol">❌</span>
      <span class="name">Player X</span>
      <span class="points" id="score-X">0</span>
    </div>
    <span class="score-sep">vs</span>
    <div class="score-card" id="card-O">
      <span class="symbol">⭕</span>
      <span class="name">Player O</span>
      <span class="points" id="score-O">0</span>
    </div>
  </div>

  <div id="status">Player X's turn</div>

  <div class="board" id="board">
    ${Array.from({ length: 9 }, (_, i) => `<div class="cell" data-index="${i}"></div>`).join("\n    ")}
  </div>

  <button id="restart-btn">↺ Restart</button>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // ── State ──────────────────────────────────────────────────
    let board       = Array(9).fill(null); // null | 'X' | 'O'
    let current     = 'X';
    let gameOver    = false;
    let scores      = { X: 0, O: 0 };

    const WINS = [
      [0,1,2],[3,4,5],[6,7,8], // rows
      [0,3,6],[1,4,7],[2,5,8], // cols
      [0,4,8],[2,4,6],         // diagonals
    ];

    // ── DOM refs ───────────────────────────────────────────────
    const cells      = document.querySelectorAll('.cell');
    const status     = document.getElementById('status');
    const scoreX     = document.getElementById('score-X');
    const scoreO     = document.getElementById('score-O');
    const cardX      = document.getElementById('card-X');
    const cardO      = document.getElementById('card-O');
    const restartBtn = document.getElementById('restart-btn');

    // ── Cell click ─────────────────────────────────────────────
    cells.forEach((cell) => {
      cell.addEventListener('click', () => {
        const idx = Number(cell.dataset.index);
        if (gameOver || board[idx]) return;

        board[idx] = current;
        cell.textContent = current === 'X' ? '❌' : '⭕';
        cell.classList.add('taken', current);

        const winLine = checkWin();
        if (winLine) {
          winLine.forEach(i => cells[i].classList.add('winner'));
          scores[current]++;
          updateScoreboard();
          status.textContent = 'Player ' + current + ' wins! 🎉';
          status.className = 'win';
          gameOver = true;
          vscode.postMessage({ command: 'win', payload: current });
        } else if (board.every(Boolean)) {
          status.textContent = "It's a draw! 🤝";
          status.className = 'draw';
          gameOver = true;
          vscode.postMessage({ command: 'draw' });
        } else {
          current = current === 'X' ? 'O' : 'X';
          status.textContent = 'Player ' + current + "'s turn";
          status.className = '';
          setActiveCard(current);
        }
      });
    });

    // ── Restart ────────────────────────────────────────────────
    restartBtn.addEventListener('click', reset);

    function reset() {
      board    = Array(9).fill(null);
      current  = 'X';
      gameOver = false;

      cells.forEach((cell) => {
        cell.textContent = '';
        cell.className = 'cell';
      });

      status.textContent = "Player X's turn";
      status.className = '';
      setActiveCard('X');
    }

    // ── Helpers ────────────────────────────────────────────────
    function checkWin() {
      for (const [a, b, c] of WINS) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
          return [a, b, c];
        }
      }
      return null;
    }

    function updateScoreboard() {
      scoreX.textContent = scores.X;
      scoreO.textContent = scores.O;
    }

    function setActiveCard(player) {
      cardX.classList.toggle('active', player === 'X');
      cardO.classList.toggle('active', player === 'O');
    }

    // ── Messages from extension ────────────────────────────────
    window.addEventListener('message', ({ data }) => {
      if (data.command === 'reset') reset();
    });

    // Restore state across tab switches (retainContextWhenHidden handles DOM,
    // but we manually persist JS state with getState/setState)
    const saved = vscode.getState();
    if (saved) {
      scores = saved.scores ?? { X: 0, O: 0 };
      updateScoreboard();
    }

    // Persist scores whenever they change
    function saveState() {
      vscode.setState({ scores });
    }
    // Patch updateScoreboard to also save
    const _orig = updateScoreboard;
    // simple inline — keep it readable for learning purposes
  </script>
</body>
</html>`;
  }

  private _dispose(): void {
    TicTacToePanel._instance = undefined;
    this._panel.dispose();
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
