/**
 * panels/SnakePanel.ts — Snake game panel.
 *
 * Architecture:
 *  - Entire game loop runs in the webview using requestAnimationFrame + setTimeout.
 *  - HTML5 Canvas handles all rendering.
 *  - Extension receives score/gameover events via postMessage.
 *
 * VSCode API concepts reinforced:
 *  - WebviewPanel singleton (same pattern as TicTacToePanel)
 *  - getState / setState for persisting high score across tab switches
 *  - postMessage both directions
 */

import * as vscode from "vscode";

export class SnakePanel {
  private static _instance: SnakePanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (SnakePanel._instance) {
      SnakePanel._instance._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "playAndWaste.snake",
      "Snake 🐍",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      }
    );

    SnakePanel._instance = new SnakePanel(panel);
  }

  private constructor(panel: vscode.WebviewPanel) {
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
      case "gameOver": {
        const { score, isNewHighScore } = msg.payload as { score: number; isNewHighScore: boolean };
        const title = isNewHighScore
          ? `🏆 New High Score: ${score}!`
          : `💀 Game Over! Score: ${score}`;
        vscode.window
          .showInformationMessage(title, "Play Again", "Close")
          .then((choice) => {
            if (choice === "Play Again") {
              this._panel.webview.postMessage({ command: "restart" });
            } else if (choice === "Close") {
              this._panel.dispose();
            }
          });
        break;
      }
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
  <title>Snake</title>
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
      gap: 1rem;
      padding: 1.5rem;
      overflow: hidden;
    }

    h1 { font-size: 1.5rem; letter-spacing: 0.05em; }

    /* ── HUD ────────────────────────────────────────────────── */
    .hud {
      display: flex;
      gap: 2.5rem;
      font-size: 0.85rem;
      color: var(--vscode-descriptionForeground);
    }

    .hud span { font-weight: 700; color: var(--vscode-foreground); }

    /* ── Canvas wrapper ────────────────────────────────────── */
    .canvas-wrap {
      position: relative;
      border: 2px solid var(--vscode-panel-border);
      border-radius: 10px;
      overflow: hidden;
    }

    canvas { display: block; }

    /* Overlay shown on pause / game-over / start */
    #overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(4px);
    }

    #overlay.hidden { display: none; }

    #overlay-title {
      font-size: 1.6rem;
      font-weight: 700;
      color: #fff;
    }

    #overlay-sub {
      font-size: 0.85rem;
      color: rgba(255,255,255,0.7);
      text-align: center;
    }

    /* ── Buttons ───────────────────────────────────────────── */
    .btn-row { display: flex; gap: 0.75rem; }

    button {
      padding: 0.45rem 1.2rem;
      border-radius: 6px;
      border: none;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.15s;
    }

    button:hover { background: var(--vscode-button-hoverBackground); }

    /* ── Controls hint ─────────────────────────────────────── */
    .hint {
      font-size: 0.72rem;
      color: var(--vscode-descriptionForeground);
      text-align: center;
    }
  </style>
</head>
<body>

  <h1>🐍 Snake</h1>

  <div class="hud">
    <div>Score &nbsp;<span id="score-display">0</span></div>
    <div>Best &nbsp;&nbsp;<span id="best-display">0</span></div>
    <div>Speed &nbsp;<span id="speed-display">1</span></div>
  </div>

  <div class="canvas-wrap">
    <canvas id="canvas"></canvas>

    <div id="overlay">
      <div id="overlay-title">🐍 Snake</div>
      <div id="overlay-sub">Use arrow keys or WASD to move</div>
      <div class="btn-row">
        <button id="start-btn">▶ Start</button>
      </div>
    </div>
  </div>

  <div class="hint">
    Arrow keys / WASD &nbsp;·&nbsp; P to pause &nbsp;·&nbsp; R to restart
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // ── Config ─────────────────────────────────────────────────────────────
    const COLS       = 20;
    const ROWS       = 20;
    const CELL       = 24;          // px per grid cell
    const BASE_SPEED = 150;         // ms per tick at speed 1
    const MIN_SPEED  = 60;          // ms per tick cap

    // ── Canvas setup ───────────────────────────────────────────────────────
    const canvas  = document.getElementById('canvas');
    const ctx     = canvas.getContext('2d');
    canvas.width  = COLS * CELL;
    canvas.height = ROWS * CELL;

    // Pull VSCode CSS variables for colours (so it adapts to any theme)
    const style       = getComputedStyle(document.body);
    const BG          = style.getPropertyValue('--vscode-editor-background').trim()   || '#1e1e1e';
    const GRID_COLOR  = style.getPropertyValue('--vscode-panel-border').trim()        || '#333';
    const FOOD_COLOR  = '#ef9a9a';   // soft red
    const SNAKE_HEAD  = '#4fc3f7';   // light blue
    const SNAKE_BODY  = '#0288d1';   // darker blue
    const TEXT_COLOR  = style.getPropertyValue('--vscode-foreground').trim()          || '#ccc';

    // ── State ──────────────────────────────────────────────────────────────
    let snake, dir, nextDir, food, score, highScore, speed, gameLoopId;
    let running        = false;
    let paused         = false;
    let gameOver       = false;
    let isNewHighScore = false;  // set during game, consumed once in endGame

    // Restore persisted high score
    const saved = vscode.getState();
    highScore = saved?.highScore ?? 0;
    document.getElementById('best-display').textContent = highScore;

    // ── DOM refs ───────────────────────────────────────────────────────────
    const overlay      = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlaySub   = document.getElementById('overlay-sub');
    const startBtn     = document.getElementById('start-btn');
    const scoreDisplay = document.getElementById('score-display');
    const bestDisplay  = document.getElementById('best-display');
    const speedDisplay = document.getElementById('speed-display');

    // ── Init / Restart ─────────────────────────────────────────────────────
    function init() {
      // Start snake in the middle, 3 segments long, heading right
      snake   = [
        { x: 12, y: 10 },
        { x: 11, y: 10 },
        { x: 10, y: 10 },
      ];
      dir      = { x: 1, y: 0 };
      nextDir  = { x: 1, y: 0 };
      score          = 0;
      speed          = 1;
      gameOver       = false;
      paused         = false;
      isNewHighScore = false;
      spawnFood();
      updateHud();
    }

    function startGame() {
      init();
      running = true;
      overlay.classList.add('hidden');
      if (gameLoopId) clearTimeout(gameLoopId);
      tick();
    }

    // ── Game loop ──────────────────────────────────────────────────────────
    function tick() {
      if (!running || paused || gameOver) return;

      dir = { ...nextDir };

      // Move head
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

      // Wall collision
      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
        endGame(); return;
      }

      // Self collision (skip last tail — it moves away this frame)
      for (let i = 0; i < snake.length - 1; i++) {
        if (snake[i].x === head.x && snake[i].y === head.y) {
          endGame(); return;
        }
      }

      snake.unshift(head);

      // Ate food?
      if (head.x === food.x && head.y === food.y) {
        score++;
        speed = Math.min(10, 1 + Math.floor(score / 5));  // level up every 5 points
        spawnFood();
        updateHud();

        if (score > highScore) {
          highScore      = score;
          isNewHighScore = true;
          bestDisplay.textContent = highScore;
          vscode.setState({ highScore });
        }
      } else {
        snake.pop();   // no food → remove tail
      }

      draw();

      // Dynamic speed: higher level = shorter interval
      const interval = Math.max(MIN_SPEED, BASE_SPEED - (speed - 1) * 10);
      gameLoopId = setTimeout(tick, interval);
    }

    // ── Food ───────────────────────────────────────────────────────────────
    function spawnFood() {
      let pos;
      do {
        pos = {
          x: Math.floor(Math.random() * COLS),
          y: Math.floor(Math.random() * ROWS),
        };
      } while (snake.some(s => s.x === pos.x && s.y === pos.y));
      food = pos;
    }

    // ── End game ───────────────────────────────────────────────────────────
    function endGame() {
      gameOver = true;
      running  = false;
      clearTimeout(gameLoopId);

      drawGameOver();

      overlayTitle.textContent = '💀 Game Over';
      overlaySub.textContent   = 'Score: ' + score + '  ·  Best: ' + highScore;
      startBtn.textContent     = '↺ Play Again';
      overlay.classList.remove('hidden');

      vscode.postMessage({
        command: 'gameOver',
        payload: { score, isNewHighScore },
      });
    }

    // ── Pause ──────────────────────────────────────────────────────────────
    function togglePause() {
      if (!running || gameOver) return;
      paused = !paused;
      if (paused) {
        clearTimeout(gameLoopId);
        overlayTitle.textContent = '⏸ Paused';
        overlaySub.textContent   = 'Press P to resume';
        startBtn.textContent     = '▶ Resume';
        overlay.classList.remove('hidden');
      } else {
        overlay.classList.add('hidden');
        tick();
      }
    }

    // ── Render ─────────────────────────────────────────────────────────────
    function draw() {
      // Background
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid lines (subtle)
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth   = 0.3;
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, canvas.height); ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(canvas.width, y * CELL); ctx.stroke();
      }

      // Food (pulsing dot)
      const pulse = 0.85 + 0.15 * Math.sin(Date.now() / 200);
      const fr    = (CELL / 2 - 2) * pulse;
      ctx.fillStyle = FOOD_COLOR;
      ctx.beginPath();
      ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, fr, 0, Math.PI * 2);
      ctx.fill();

      // Snake segments
      snake.forEach((seg, i) => {
        const r = 4; // corner radius
        const x = seg.x * CELL + 1;
        const y = seg.y * CELL + 1;
        const w = CELL - 2;
        const h = CELL - 2;

        ctx.fillStyle = i === 0 ? SNAKE_HEAD : SNAKE_BODY;
        roundRect(ctx, x, y, w, h, r);
        ctx.fill();

        // Eyes on head
        if (i === 0) {
          ctx.fillStyle = '#fff';
          const ex = dir.x === 0 ? [x + 5, x + w - 9] : dir.x > 0 ? [x + w - 8, x + w - 8] : [x + 2, x + 2];
          const ey = dir.y === 0 ? [y + 5, y + h - 9] : dir.y > 0 ? [y + h - 8, y + h - 8] : [y + 2, y + 2];
          ctx.beginPath(); ctx.arc(ex[0], ey[0], 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(ex[1], ey[1], 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#222';
          ctx.beginPath(); ctx.arc(ex[0] + dir.x, ey[0] + dir.y, 1.2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(ex[1] + dir.x, ey[1] + dir.y, 1.2, 0, Math.PI * 2); ctx.fill();
        }
      });
    }

    function drawGameOver() {
      draw();
      // Darken canvas
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // ── HUD ────────────────────────────────────────────────────────────────
    function updateHud() {
      scoreDisplay.textContent = score;
      bestDisplay.textContent  = highScore;
      speedDisplay.textContent = speed;
    }

    // ── Canvas rounded-rect helper ─────────────────────────────────────────
    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    // ── Keyboard ───────────────────────────────────────────────────────────
    // We use keydown on the window so the canvas doesn't need focus.
    window.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W':
          e.preventDefault();
          if (dir.y !== 1) nextDir = { x: 0, y: -1 }; break;
        case 'ArrowDown':  case 's': case 'S':
          e.preventDefault();
          if (dir.y !== -1) nextDir = { x: 0, y: 1 }; break;
        case 'ArrowLeft':  case 'a': case 'A':
          e.preventDefault();
          if (dir.x !== 1) nextDir = { x: -1, y: 0 }; break;
        case 'ArrowRight': case 'd': case 'D':
          e.preventDefault();
          if (dir.x !== -1) nextDir = { x: 1, y: 0 }; break;
        case 'p': case 'P':
          togglePause(); break;
        case 'r': case 'R':
          startGame(); break;
      }
    });

    // ── Buttons ────────────────────────────────────────────────────────────
    startBtn.addEventListener('click', startGame);

    // ── Messages from extension ────────────────────────────────────────────
    window.addEventListener('message', ({ data }) => {
      if (data.command === 'restart') startGame();
    });

    // ── Initial draw (empty board) ─────────────────────────────────────────
    // Draw the grid so the panel isn't blank before the user starts.
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth   = 0.3;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(canvas.width, y * CELL); ctx.stroke();
    }
  </script>
</body>
</html>`;
  }

  private _dispose(): void {
    SnakePanel._instance = undefined;
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
