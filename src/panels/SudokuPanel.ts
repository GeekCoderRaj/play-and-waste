/**
 * panels/SudokuPanel.ts — Sudoku game panel.
 *
 * Architecture:
 *  - Board is a flat array of 81 cells (row-major, 0 = empty).
 *  - Generator: fill board via backtracking, then remove cells by difficulty.
 *  - UI: CSS grid of 81 divs; selection, highlighting, and conflicts are
 *    managed purely through CSS classes toggled in JS.
 *  - Timer runs in the webview; elapsed time is sent to the extension on solve.
 */

import * as vscode from "vscode";

export class SudokuPanel {
  private static _instance: SudokuPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (SudokuPanel._instance) {
      SudokuPanel._instance._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "playAndWaste.sudoku",
      "Sudoku 🔢",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      }
    );

    SudokuPanel._instance = new SudokuPanel(panel);
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
      case "solved": {
        const { time, difficulty } = msg.payload as { time: string; difficulty: string };
        vscode.window
          .showInformationMessage(
            `🎉 Solved! Difficulty: ${difficulty}  ·  Time: ${time}`,
            "New Game",
            "Close"
          )
          .then((choice) => {
            if (choice === "New Game") {
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
  <title>Sudoku</title>
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

    .diff-btn {
      padding: 0.25rem 0.7rem;
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border);
      background: transparent;
      color: var(--vscode-foreground);
      font-size: 0.78rem;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .diff-btn.active, .diff-btn:hover {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }

    /* ── Board ──────────────────────────────────────────────── */
    .board-wrap {
      border: 3px solid var(--vscode-foreground);
      border-radius: 4px;
      display: inline-block;
    }

    .board {
      display: grid;
      grid-template-columns: repeat(9, 1fr);
      /* gap: 0; borders handled per-cell */
    }

    .cell {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      font-weight: 400;
      cursor: pointer;
      border: 1px solid var(--vscode-panel-border);
      position: relative;
      transition: background 0.1s;
      user-select: none;
    }

    /* Thick borders between 3×3 boxes */
    .cell[data-col="3"], .cell[data-col="6"] { border-left: 2px solid var(--vscode-foreground); }
    .cell[data-row="3"], .cell[data-row="6"] { border-top:  2px solid var(--vscode-foreground); }

    /* States */
    .cell.given      { font-weight: 700; color: var(--vscode-foreground); }
    .cell.user       { color: #4fc3f7; }
    .cell.highlight  { background: var(--vscode-editor-inactiveSelectionBackground); }
    .cell.samenum    { background: var(--vscode-editor-selectionHighlightBackground); }
    .cell.selected   { background: var(--vscode-editor-selectionBackground) !important; }
    .cell.conflict   { color: #ef5350 !important; }

    /* Notes (pencil marks) — 3×3 mini grid inside cell */
    .notes {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      width: 100%;
      height: 100%;
      padding: 1px;
    }
    .note {
      font-size: 0.45rem;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--vscode-descriptionForeground);
      line-height: 1;
    }

    /* ── Number pad ─────────────────────────────────────────── */
    .numpad {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 6px;
    }

    .num-btn {
      width: 44px;
      height: 44px;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-inactiveSelectionBackground);
      color: var(--vscode-foreground);
      font-size: 1.1rem;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }
    .num-btn:hover  { background: var(--vscode-editor-selectionBackground); transform: scale(1.06); }
    .num-btn:active { transform: scale(0.96); }
    .num-btn.erase  { font-size: 0.85rem; color: #ef9a9a; }
    .num-btn.note-toggle { font-size: 0.75rem; color: var(--vscode-descriptionForeground); }
    .num-btn.note-toggle.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }

    /* ── Action row ─────────────────────────────────────────── */
    .actions { display: flex; gap: 0.75rem; }

    button.action-btn {
      padding: 0.4rem 1rem;
      border-radius: 6px;
      border: none;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 0.82rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    button.action-btn:hover { background: var(--vscode-button-hoverBackground); }
    button.action-btn.secondary {
      background: var(--vscode-editor-inactiveSelectionBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-panel-border);
    }
    button.action-btn.secondary:hover { background: var(--vscode-editor-selectionBackground); }

    /* ── Completion flash ───────────────────────────────────── */
    @keyframes flash {
      0%, 100% { background: var(--vscode-editor-background); }
      50%       { background: rgba(76, 175, 80, 0.2); }
    }
    .board.solved .cell { animation: flash 0.6s ease 2; }
  </style>
</head>
<body>

  <h1>🔢 Sudoku</h1>

  <div class="topbar">
    <div>
      Difficulty:
      <button class="diff-btn active" data-diff="easy">Easy</button>
      <button class="diff-btn" data-diff="medium">Medium</button>
      <button class="diff-btn" data-diff="hard">Hard</button>
    </div>
    <div>Time: <strong id="timer">0:00</strong></div>
    <div id="mistakes-label">Mistakes: <strong id="mistakes">0</strong></div>
  </div>

  <div class="board-wrap">
    <div class="board" id="board"></div>
  </div>

  <div class="numpad" id="numpad">
    ${[1,2,3,4,5,6,7,8,9].map(n =>
      `<button class="num-btn" data-n="${n}">${n}</button>`
    ).join('')}
    <button class="num-btn note-toggle" id="note-btn" title="Toggle pencil mode">✏️</button>
  </div>

  <div class="actions">
    <button class="action-btn" id="new-btn">↺ New Game</button>
    <button class="action-btn secondary" id="check-btn">✓ Check</button>
    <button class="action-btn secondary" id="reveal-btn">👁 Reveal Cell</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // ── Board constants ────────────────────────────────────────────────────
    const SIZE = 9;
    const BOX  = 3;

    // ── State ──────────────────────────────────────────────────────────────
    let puzzle    = [];   // 81 ints, 0 = empty
    let solution  = [];   // 81 ints, complete board
    let given     = [];   // 81 bools — true = original clue (read-only)
    let userNotes = Array.from({length: 81}, () => new Set()); // pencil marks
    let selected  = -1;
    let mistakes  = 0;
    let noteMode  = false;
    let difficulty = 'easy';
    let timerInterval, elapsed = 0, solved = false;

    // ── DOM refs ───────────────────────────────────────────────────────────
    const boardEl    = document.getElementById('board');
    const timerEl    = document.getElementById('timer');
    const mistakesEl = document.getElementById('mistakes');
    const noteBtn    = document.getElementById('note-btn');

    // ── Puzzle generator ───────────────────────────────────────────────────
    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    function isValidPlacement(board, idx, val) {
      const row = Math.floor(idx / SIZE);
      const col = idx % SIZE;
      const boxR = Math.floor(row / BOX) * BOX;
      const boxC = Math.floor(col / BOX) * BOX;

      for (let i = 0; i < SIZE; i++) {
        if (board[row * SIZE + i] === val) return false;  // row
        if (board[i * SIZE + col] === val) return false;  // col
        const br = boxR + Math.floor(i / BOX);
        const bc = boxC + (i % BOX);
        if (board[br * SIZE + bc] === val) return false;  // box
      }
      return true;
    }

    function fillBoard(board, pos = 0) {
      if (pos === 81) return true;
      const nums = shuffle([1,2,3,4,5,6,7,8,9]);
      for (const n of nums) {
        if (isValidPlacement(board, pos, n)) {
          board[pos] = n;
          if (fillBoard(board, pos + 1)) return true;
          board[pos] = 0;
        }
      }
      return false;
    }

    function generatePuzzle(diff) {
      const full = new Array(81).fill(0);
      fillBoard(full, 0);

      const clues = { easy: 38, medium: 30, hard: 24 }[diff];
      const puz   = [...full];
      const cells = shuffle([...Array(81).keys()]);

      let removed = 0;
      for (const idx of cells) {
        if (removed >= 81 - clues) break;
        puz[idx] = 0;
        removed++;
      }
      return { puzzle: puz, solution: full };
    }

    // ── New game ───────────────────────────────────────────────────────────
    function newGame() {
      solved    = false;
      mistakes  = 0;
      elapsed   = 0;
      selected  = -1;
      noteMode  = false;
      userNotes = Array.from({length: 81}, () => new Set());
      mistakesEl.textContent = 0;
      noteBtn.classList.remove('active');
      boardEl.classList.remove('solved');

      const gen  = generatePuzzle(difficulty);
      puzzle     = gen.puzzle;
      solution   = gen.solution;
      given      = puzzle.map(v => v !== 0);

      stopTimer(); startTimer();
      renderBoard();
    }

    // ── Timer ──────────────────────────────────────────────────────────────
    function startTimer() {
      timerInterval = setInterval(() => {
        if (solved) return;
        elapsed++;
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        timerEl.textContent = m + ':' + String(s).padStart(2, '0');
      }, 1000);
    }

    function stopTimer() {
      clearInterval(timerInterval);
    }

    function formatTime() {
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      return m + ':' + String(s).padStart(2, '0');
    }

    // ── Render ─────────────────────────────────────────────────────────────
    function renderBoard() {
      boardEl.innerHTML = '';
      for (let i = 0; i < 81; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.idx = i;
        cell.dataset.row = Math.floor(i / SIZE);
        cell.dataset.col = i % SIZE;

        if (given[i]) {
          cell.classList.add('given');
          cell.textContent = puzzle[i];
        } else if (puzzle[i] !== 0) {
          cell.classList.add('user');
          cell.textContent = puzzle[i];
        } else if (userNotes[i].size > 0) {
          renderNotes(cell, userNotes[i]);
        }

        cell.addEventListener('click', () => selectCell(i));
        boardEl.appendChild(cell);
      }
      updateHighlights();
    }

    function renderNotes(cell, notes) {
      cell.textContent = '';
      const grid = document.createElement('div');
      grid.className = 'notes';
      for (let n = 1; n <= 9; n++) {
        const span = document.createElement('div');
        span.className = 'note';
        span.textContent = notes.has(n) ? n : '';
        grid.appendChild(span);
      }
      cell.appendChild(grid);
    }

    function getCellEl(idx) {
      return boardEl.querySelector('[data-idx="' + idx + '"]');
    }

    // ── Highlighting ───────────────────────────────────────────────────────
    function updateHighlights() {
      const cells = boardEl.querySelectorAll('.cell');
      cells.forEach(c => c.classList.remove('selected', 'highlight', 'samenum', 'conflict'));

      if (selected === -1) return;

      const selRow = Math.floor(selected / SIZE);
      const selCol = selected % SIZE;
      const selBox = Math.floor(selRow / BOX) * BOX + Math.floor(selCol / BOX);
      const selVal = puzzle[selected];

      cells.forEach((c) => {
        const idx = Number(c.dataset.idx);
        const row = Math.floor(idx / SIZE);
        const col = idx % SIZE;
        const box = Math.floor(row / BOX) * BOX + Math.floor(col / BOX);

        if (idx === selected) {
          c.classList.add('selected');
        } else if (row === selRow || col === selCol || box === selBox) {
          c.classList.add('highlight');
        }

        if (selVal !== 0 && puzzle[idx] === selVal) {
          c.classList.add('samenum');
        }
      });

      // Mark conflicts
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === 0 || given[i]) continue;
        if (!isValidPlacement(puzzle.map((v, j) => j === i ? 0 : v), i, puzzle[i])) {
          getCellEl(i)?.classList.add('conflict');
        }
      }
    }

    // ── Cell selection ─────────────────────────────────────────────────────
    function selectCell(idx) {
      if (solved) return;
      selected = idx;
      updateHighlights();
    }

    // ── Input a value ──────────────────────────────────────────────────────
    function inputValue(val) {
      if (selected === -1 || given[selected] || solved) return;

      if (noteMode && val !== 0) {
        // Toggle pencil mark
        if (userNotes[selected].has(val)) {
          userNotes[selected].delete(val);
        } else {
          userNotes[selected].add(val);
        }
        const cell = getCellEl(selected);
        if (userNotes[selected].size > 0) {
          cell.textContent = '';
          renderNotes(cell, userNotes[selected]);
        } else {
          cell.textContent = '';
        }
        cell.className = 'cell';
        cell.dataset.idx = selected;
        cell.dataset.row = Math.floor(selected / SIZE);
        cell.dataset.col = selected % SIZE;
        return;
      }

      // Clear notes for this cell
      userNotes[selected].clear();

      // Clear notes in same row/col/box for this value
      if (val !== 0) {
        const row = Math.floor(selected / SIZE);
        const col = selected % SIZE;
        const boxR = Math.floor(row / BOX) * BOX;
        const boxC = Math.floor(col / BOX) * BOX;
        for (let i = 0; i < SIZE; i++) {
          [row * SIZE + i, i * SIZE + col,
           (boxR + Math.floor(i / BOX)) * SIZE + boxC + (i % BOX)]
          .forEach(idx => userNotes[idx]?.delete(val));
        }
      }

      puzzle[selected] = val;
      const cell = getCellEl(selected);
      cell.className = 'cell user';
      cell.dataset.idx = selected;
      cell.dataset.row = Math.floor(selected / SIZE);
      cell.dataset.col = selected % SIZE;
      cell.textContent = val || '';

      updateHighlights();
      checkSolved();
    }

    // ── Check / Solve ──────────────────────────────────────────────────────
    function checkSolved() {
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] !== solution[i]) return;
      }
      solved = true;
      stopTimer();
      boardEl.classList.add('solved');

      const time = formatTime();
      vscode.postMessage({ command: 'solved', payload: { time, difficulty } });
    }

    function checkBoard() {
      let wrong = 0;
      for (let i = 0; i < 81; i++) {
        if (!given[i] && puzzle[i] !== 0 && puzzle[i] !== solution[i]) {
          wrong++;
          getCellEl(i)?.classList.add('conflict');
        }
      }
      if (wrong === 0) {
        // All filled cells are correct
        const allFilled = puzzle.every(v => v !== 0);
        if (allFilled) checkSolved();
      } else {
        mistakes += wrong;
        mistakesEl.textContent = mistakes;
      }
    }

    function revealCell() {
      if (selected === -1 || given[selected] || solved) return;
      puzzle[selected]     = solution[selected];
      given[selected]      = true;
      userNotes[selected].clear();
      const cell           = getCellEl(selected);
      cell.className       = 'cell given';
      cell.dataset.idx     = selected;
      cell.dataset.row     = Math.floor(selected / SIZE);
      cell.dataset.col     = selected % SIZE;
      cell.textContent     = solution[selected];
      updateHighlights();
      checkSolved();
    }

    // ── Keyboard ───────────────────────────────────────────────────────────
    window.addEventListener('keydown', (e) => {
      const nav = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
      if (nav[e.key] !== undefined) {
        e.preventDefault();
        if (selected === -1) { selectCell(0); return; }
        const next = selected + nav[e.key];
        if (next >= 0 && next < 81) selectCell(next);
        return;
      }

      if (e.key >= '1' && e.key <= '9') { inputValue(Number(e.key)); return; }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { inputValue(0); return; }
      if (e.key === 'n' || e.key === 'N') { toggleNoteMode(); return; }
    });

    // ── Numpad ─────────────────────────────────────────────────────────────
    document.getElementById('numpad').addEventListener('click', (e) => {
      const btn = e.target.closest('.num-btn');
      if (!btn) return;
      const n = btn.dataset.n;
      if (n !== undefined) inputValue(Number(n));
    });

    // Note mode toggle
    function toggleNoteMode() {
      noteMode = !noteMode;
      noteBtn.classList.toggle('active', noteMode);
    }
    noteBtn.addEventListener('click', toggleNoteMode);

    // ── Action buttons ─────────────────────────────────────────────────────
    document.getElementById('new-btn').addEventListener('click', newGame);
    document.getElementById('check-btn').addEventListener('click', checkBoard);
    document.getElementById('reveal-btn').addEventListener('click', revealCell);

    // Difficulty buttons
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        difficulty = btn.dataset.diff;
        newGame();
      });
    });

    // ── Messages from extension ────────────────────────────────────────────
    window.addEventListener('message', ({ data }) => {
      if (data.command === 'newGame') newGame();
    });

    // ── State persistence ──────────────────────────────────────────────────
    // Restore difficulty from previous session
    const saved = vscode.getState();
    if (saved?.difficulty) {
      difficulty = saved.difficulty;
      document.querySelectorAll('.diff-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.diff === difficulty);
      });
    }

    // Save difficulty on change
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => vscode.setState({ difficulty: btn.dataset.diff }));
    });

    // ── Erase button (last in numpad, after note-btn) ──────────────────────
    const eraseBtn = document.createElement('button');
    eraseBtn.className = 'num-btn erase';
    eraseBtn.title = 'Erase (Delete)';
    eraseBtn.textContent = '⌫';
    eraseBtn.addEventListener('click', () => inputValue(0));
    document.getElementById('numpad').appendChild(eraseBtn);

    // ── Start ──────────────────────────────────────────────────────────────
    newGame();
  </script>
</body>
</html>`;
  }

  private _dispose(): void {
    SudokuPanel._instance = undefined;
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
