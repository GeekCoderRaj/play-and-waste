/**
 * panels/MemoryPanel.ts — Memory Match game panel.
 *
 * Architecture:
 *  - Deck of emoji pairs shuffled into a grid.
 *  - CSS 3D perspective flip animation for card reveal.
 *  - Three grid sizes: 4×4 (8 pairs), 4×6 (12 pairs), 6×6 (18 pairs).
 *  - Tracks moves, time, and best moves per size via vscode.setState.
 */

import * as vscode from "vscode";

export class MemoryPanel {
  private static _instance: MemoryPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (MemoryPanel._instance) {
      MemoryPanel._instance._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "playAndWaste.memory",
      "Memory Match 🃏",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      }
    );

    MemoryPanel._instance = new MemoryPanel(panel);
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
      case "won": {
        const { moves, time, size, isRecord } = msg.payload as {
          moves: number;
          time: string;
          size: string;
          isRecord: boolean;
        };
        const title = isRecord
          ? `🏆 New Record! ${moves} moves in ${time}`
          : `🎉 You matched all pairs in ${moves} moves (${time})`;
        vscode.window
          .showInformationMessage(title, "Play Again", "Close")
          .then((choice) => {
            if (choice === "Play Again") {
              this._panel.webview.postMessage({ command: "newGame" });
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
  <title>Memory Match</title>
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
    }

    h1 { font-size: 1.4rem; letter-spacing: 0.04em; }

    /* ── Top bar ────────────────────────────────────────────── */
    .topbar {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      font-size: 0.82rem;
      color: var(--vscode-descriptionForeground);
    }
    .topbar strong { color: var(--vscode-foreground); font-size: 1rem; }

    .size-btn {
      padding: 0.25rem 0.7rem;
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border);
      background: transparent;
      color: var(--vscode-foreground);
      font-size: 0.78rem;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .size-btn.active, .size-btn:hover {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }

    /* ── Card grid ──────────────────────────────────────────── */
    .grid {
      display: grid;
      gap: 10px;
    }

    /* ── Card (3-D flip) ────────────────────────────────────── */
    /*
      Each .card is a perspective container.
      .card-inner rotates on the Y axis.
      .card-front (emoji) starts rotated 180° (hidden).
      .card-back  (pattern) starts at 0° (visible).
      When .card.flipped is added, .card-inner rotates to 180°,
      revealing the front and hiding the back.
    */
    .card {
      perspective: 600px;
      cursor: pointer;
    }

    .card-inner {
      width: 100%;
      height: 100%;
      position: relative;
      transform-style: preserve-3d;
      transition: transform 0.35s ease;
      border-radius: 10px;
    }

    .card.flipped   .card-inner { transform: rotateY(180deg); }
    .card.matched   .card-inner { transform: rotateY(180deg); }

    .card-front,
    .card-back {
      position: absolute;
      inset: 0;
      border-radius: 10px;
      backface-visibility: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Back face — decorative cover */
    .card-back {
      background: var(--vscode-button-background);
      border: 2px solid var(--vscode-focusBorder);
      font-size: 1.4rem;
      color: var(--vscode-button-foreground);
      opacity: 0.8;
    }

    /* Front face — emoji */
    .card-front {
      transform: rotateY(180deg);
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 2px solid var(--vscode-panel-border);
      font-size: 2rem;
      transition: border-color 0.2s;
    }

    .card.matched .card-front {
      background: color-mix(in srgb, var(--vscode-editor-background) 70%, #4caf50 30%);
      border-color: #4caf50;
    }

    /* Shake animation for wrong pair */
    @keyframes shake {
      0%, 100% { transform: rotateY(180deg) translateX(0); }
      25%       { transform: rotateY(180deg) translateX(-5px); }
      75%       { transform: rotateY(180deg) translateX(5px); }
    }
    .card.wrong .card-front { animation: shake 0.35s ease; border-color: #ef5350; }

    /* Hover on unflipped cards */
    .card:not(.flipped):not(.matched) .card-back:hover {
      opacity: 1;
      transform: translateY(-2px);
    }

    /* ── Stat bar ───────────────────────────────────────────── */
    .statbar {
      display: flex;
      gap: 2rem;
      font-size: 0.82rem;
      color: var(--vscode-descriptionForeground);
    }
    .statbar strong { color: var(--vscode-foreground); }

    /* ── Action button ──────────────────────────────────────── */
    button.action-btn {
      padding: 0.4rem 1.2rem;
      border-radius: 6px;
      border: none;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 0.82rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    button.action-btn:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>

  <h1>🃏 Memory Match</h1>

  <div class="topbar">
    <div>
      Grid:
      <button class="size-btn active" data-size="4x4">4 × 4</button>
      <button class="size-btn" data-size="4x6">4 × 6</button>
      <button class="size-btn" data-size="6x6">6 × 6</button>
    </div>
    <div>Time: <strong id="timer">0:00</strong></div>
  </div>

  <div class="grid" id="grid"></div>

  <div class="statbar">
    <div>Moves: <strong id="moves-display">0</strong></div>
    <div>Pairs found: <strong id="pairs-display">0</strong> / <strong id="total-display">0</strong></div>
    <div>Best: <strong id="best-display">—</strong></div>
  </div>

  <button class="action-btn" id="new-btn">↺ New Game</button>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // ── Emoji pool ─────────────────────────────────────────────────────────
    // 18 emojis → enough for a 6×6 grid (18 pairs)
    const EMOJI_POOL = [
      '🐶','🐱','🦊','🐸','🐼','🦁','🐮','🐷','🐙','🦋',
      '🌸','🌈','⭐','🍕','🎮','🚀','🎸','🍦',
    ];

    // ── Size config ────────────────────────────────────────────────────────
    const SIZES = {
      '4x4': { cols: 4, rows: 4, pairs: 8,  cardPx: 80 },
      '4x6': { cols: 6, rows: 4, pairs: 12, cardPx: 72 },
      '6x6': { cols: 6, rows: 6, pairs: 18, cardPx: 72 },
    };

    // ── State ──────────────────────────────────────────────────────────────
    let cards        = [];   // [{id, emoji, el}]
    let flipped      = [];   // up to 2 card ids currently face-up
    let matched      = new Set();
    let moves        = 0;
    let elapsed      = 0;
    let timerInterval;
    let locked       = false; // prevent clicking during flip-back animation
    let size         = '4x4';
    let bestMoves    = {};    // { '4x4': number, '4x6': number, '6x6': number }
    let gameWon      = false;

    // Restore persisted state
    const saved = vscode.getState() || {};
    bestMoves = saved.bestMoves || {};
    size = saved.size || '4x4';

    // ── DOM refs ───────────────────────────────────────────────────────────
    const gridEl        = document.getElementById('grid');
    const timerEl       = document.getElementById('timer');
    const movesEl       = document.getElementById('moves-display');
    const pairsEl       = document.getElementById('pairs-display');
    const totalEl       = document.getElementById('total-display');
    const bestEl        = document.getElementById('best-display');

    // ── Timer ──────────────────────────────────────────────────────────────
    function startTimer() {
      stopTimer();
      elapsed = 0;
      timerEl.textContent = '0:00';
      timerInterval = setInterval(() => {
        elapsed++;
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        timerEl.textContent = m + ':' + String(s).padStart(2, '0');
      }, 1000);
    }
    function stopTimer() { clearInterval(timerInterval); }
    function formatTime() {
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      return m + ':' + String(s).padStart(2, '0');
    }

    // ── New game ───────────────────────────────────────────────────────────
    function newGame() {
      const cfg = SIZES[size];
      matched  = new Set();
      flipped  = [];
      moves    = 0;
      locked   = false;
      gameWon  = false;

      movesEl.textContent = 0;
      pairsEl.textContent = 0;
      totalEl.textContent = cfg.pairs;
      updateBestDisplay();

      // Build deck: pick "pairs" emojis, duplicate, shuffle
      const pool    = shuffle([...EMOJI_POOL]).slice(0, cfg.pairs);
      const deck    = shuffle([...pool, ...pool]);

      // Grid layout
      gridEl.style.gridTemplateColumns = 'repeat(' + cfg.cols + ', ' + cfg.cardPx + 'px)';
      gridEl.innerHTML = '';
      cards = [];

      deck.forEach((emoji, i) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.width  = cfg.cardPx + 'px';
        card.style.height = cfg.cardPx + 'px';
        card.innerHTML =
          '<div class="card-inner">' +
            '<div class="card-back">?</div>' +
            '<div class="card-front">' + emoji + '</div>' +
          '</div>';

        card.addEventListener('click', () => onCardClick(i));
        gridEl.appendChild(card);
        cards.push({ id: i, emoji, el: card });
      });

      startTimer();
    }

    // ── Card click ─────────────────────────────────────────────────────────
    function onCardClick(id) {
      if (locked || gameWon) return;
      const card = cards[id];
      if (card.el.classList.contains('flipped') ||
          card.el.classList.contains('matched')) return;

      card.el.classList.add('flipped');
      flipped.push(id);

      if (flipped.length === 2) {
        locked = true;
        moves++;
        movesEl.textContent = moves;

        const [a, b] = flipped;
        if (cards[a].emoji === cards[b].emoji) {
          // Match!
          setTimeout(() => {
            cards[a].el.classList.remove('flipped');
            cards[b].el.classList.remove('flipped');
            cards[a].el.classList.add('matched');
            cards[b].el.classList.add('matched');
            matched.add(a);
            matched.add(b);
            pairsEl.textContent = matched.size / 2;
            flipped = [];
            locked  = false;

            if (matched.size === cards.length) onWin();
          }, 400);
        } else {
          // No match — shake and flip back
          cards[a].el.classList.add('wrong');
          cards[b].el.classList.add('wrong');
          setTimeout(() => {
            cards[a].el.classList.remove('flipped', 'wrong');
            cards[b].el.classList.remove('flipped', 'wrong');
            flipped = [];
            locked  = false;
          }, 900);
        }
      }
    }

    // ── Win ────────────────────────────────────────────────────────────────
    function onWin() {
      stopTimer();
      gameWon = true;

      const prev      = bestMoves[size];
      const isRecord  = prev === undefined || moves < prev;
      if (isRecord) {
        bestMoves[size] = moves;
        vscode.setState({ bestMoves, size });
        updateBestDisplay();
      }

      const time = formatTime();
      vscode.postMessage({ command: 'won', payload: { moves, time, size, isRecord } });
    }

    // ── Helpers ────────────────────────────────────────────────────────────
    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    function updateBestDisplay() {
      const b = bestMoves[size];
      bestEl.textContent = b !== undefined ? b + ' moves' : '—';
    }

    // ── Size buttons ───────────────────────────────────────────────────────
    document.querySelectorAll('.size-btn').forEach(btn => {
      // Restore active state
      btn.classList.toggle('active', btn.dataset.size === size);

      btn.addEventListener('click', () => {
        document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        size = btn.dataset.size;
        vscode.setState({ bestMoves, size });
        updateBestDisplay();
        newGame();
      });
    });

    // ── New game button ────────────────────────────────────────────────────
    document.getElementById('new-btn').addEventListener('click', newGame);

    // ── Messages from extension ────────────────────────────────────────────
    window.addEventListener('message', ({ data }) => {
      if (data.command === 'newGame') newGame();
    });

    // ── Start ──────────────────────────────────────────────────────────────
    newGame();
  </script>
</body>
</html>`;
  }

  private _dispose(): void {
    MemoryPanel._instance = undefined;
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
