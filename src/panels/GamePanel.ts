/**
 * panels/GamePanel.ts — A singleton WebviewPanel that will host games.
 *
 * VSCode API concepts covered here:
 *  - vscode.window.createWebviewPanel   : creates a tab with a full HTML page
 *  - WebviewPanel.webview.html          : set page content as a string
 *  - WebviewPanel.webview.postMessage   : extension → webview messaging
 *  - WebviewPanel.webview.onDidReceiveMessage : webview → extension messaging
 *  - WebviewPanel.onDidDispose          : cleanup when the tab is closed
 *  - getNonce()                         : Content Security Policy best practice
 *  - vscode.Uri / asWebviewUri          : safely reference extension assets
 */

import * as vscode from "vscode";

export class GamePanel {
  // We keep one instance alive so "Open Panel" can reveal instead of duplicate.
  private static _instance: GamePanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  // ── Public factory ───────────────────────────────────────────────────────
  static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If a panel already exists, just bring it to the front.
    if (GamePanel._instance) {
      GamePanel._instance._panel.reveal(column);
      return;
    }

    // Create a brand-new webview panel.
    const panel = vscode.window.createWebviewPanel(
      "playAndWaste",         // Internal identifier (used in state save/restore)
      "Play & Waste 🎮",       // Title shown in the tab
      column ?? vscode.ViewColumn.One,
      {
        // Allow JavaScript inside the webview
        enableScripts: true,

        // Restrict resource loading to the extension's own media/ folder.
        // This is a security best practice — webviews run in an isolated iframe.
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "media"),
        ],

        // Retain state when the panel is hidden (tab not visible).
        // Without this, the webview HTML is destroyed every time you switch tabs.
        retainContextWhenHidden: true,
      }
    );

    GamePanel._instance = new GamePanel(panel, context);
  }

  // ── Constructor ──────────────────────────────────────────────────────────
  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;

    // Render the initial HTML
    this._render();

    // Listen for messages coming FROM the webview (e.g., button clicks inside the page)
    this._panel.webview.onDidReceiveMessage(
      (message: { command: string; payload?: unknown }) => {
        this._handleWebviewMessage(message);
      },
      undefined,
      this._disposables
    );

    // Clean up when the panel is closed by the user
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);

    // Re-render if the panel becomes visible again (good practice for dynamic content)
    this._panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.visible) {
          this._render();
        }
      },
      null,
      this._disposables
    );
  }

  // ── Send a message TO the webview ────────────────────────────────────────
  // Call this from commands or event handlers to push data into the page.
  sendMessage(command: string, payload?: unknown): void {
    this._panel.webview.postMessage({ command, payload });
  }

  // ── Handle messages FROM the webview ─────────────────────────────────────
  private _handleWebviewMessage(message: { command: string; payload?: unknown }): void {
    switch (message.command) {
      case "ready":
        // Webview signals it has loaded and is ready to receive data
        vscode.window.showInformationMessage("Game panel is ready! 🎮");
        break;

      case "openGame": {
        const commandMap: Record<string, string> = {
          tictactoe: "playAndWaste.playTicTacToe",
          snake:     "playAndWaste.playSnake",
          memory:    "playAndWaste.playMemory",
          sudoku:    "playAndWaste.playSudoku",
        };
        const cmd = commandMap[message.payload as string];
        if (cmd) {
          vscode.commands.executeCommand(cmd);
        }
        break;
      }

      case "alert":
        vscode.window.showInformationMessage(String(message.payload ?? ""));
        break;

      case "openSettings":
        vscode.commands.executeCommand("workbench.action.openSettings", "playAndWaste");
        break;

      default:
        console.warn(`Unknown message from webview: ${message.command}`);
    }
  }

  // ── Build the HTML page ───────────────────────────────────────────────────
  private _render(): void {
    this._panel.webview.html = this._getHtml(this._panel.webview);
  }

  private _getHtml(webview: vscode.Webview): string {
    // A nonce (number-used-once) is a random string included in the CSP and in
    // every <script> tag. It proves the script was put there by the extension,
    // not injected by a malicious third party.
    const nonce = getNonce();

    // To load local files (CSS, JS, images) inside a webview you MUST convert
    // the disk URI to a webview-safe URI with asWebviewUri.
    // const styleUri = webview.asWebviewUri(
    //   vscode.Uri.joinPath(this._context.extensionUri, "media", "game.css")
    // );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />

  <!--
    Content Security Policy — IMPORTANT!
    VSCode webviews are sandboxed iframes. The CSP controls what content is
    allowed to load. Without it the webview is vulnerable to XSS.

    Rules used here:
      default-src 'none'           — block everything unless explicitly allowed
      style-src   ${webview.cspSource} 'unsafe-inline'  — allow styles from extension + inline
      script-src  'nonce-${nonce}'  — only run <script> tags that carry this nonce
      img-src     ${webview.cspSource} https: data:       — images from extension or HTTPS
  -->
  <meta
    http-equiv="Content-Security-Policy"
    content="
      default-src 'none';
      style-src ${webview.cspSource} 'unsafe-inline';
      script-src 'nonce-${nonce}';
      img-src ${webview.cspSource} https: data:;
    "
  />

  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Play & Waste</title>

  <style>
    /* VSCode exposes its colour tokens as CSS variables — use them so the
       panel matches the user's chosen theme automatically. */
    :root {
      --gap: 1rem;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--gap);
      padding: 2rem;
    }

    h1 {
      font-size: 2rem;
      color: var(--vscode-textLink-foreground);
    }

    p {
      color: var(--vscode-descriptionForeground);
      text-align: center;
      max-width: 480px;
      line-height: 1.6;
    }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: var(--gap);
      width: 100%;
      max-width: 600px;
      margin-top: 1rem;
    }

    .card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 1.25rem 1rem;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.15s, transform 0.1s;
      user-select: none;
    }

    .card:hover {
      border-color: var(--vscode-focusBorder);
      transform: translateY(-2px);
    }

    .card:active {
      transform: translateY(0);
    }

    .card-icon { font-size: 2rem; }
    .card-label {
      margin-top: 0.5rem;
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    .card-sub {
      font-size: 0.75rem;
      color: var(--vscode-descriptionForeground);
      margin-top: 0.25rem;
    }

    .badge {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 0.65rem;
      border-radius: 4px;
      padding: 1px 5px;
      margin-top: 0.4rem;
    }

    #log {
      margin-top: 1.5rem;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.8rem;
      color: var(--vscode-terminal-ansiGreen);
      width: 100%;
      max-width: 600px;
      background: var(--vscode-terminal-background, #1e1e1e);
      border-radius: 6px;
      padding: 0.75rem 1rem;
      min-height: 60px;
    }
  </style>
</head>
<body>
  <h1>🎮 Play &amp; Waste</h1>
  <p>Pick a game to play right inside VSCode. Games are rendered in this Webview panel — an isolated iframe with full HTML/CSS/JS power.</p>

  <div class="card-grid">
    <div class="card" data-game="tictactoe">
      <div class="card-icon">⭕</div>
      <div class="card-label">Tic Tac Toe</div>
      <div class="card-sub">2 players</div>
      <span class="badge">Play</span>
    </div>
    <div class="card" data-game="snake">
      <div class="card-icon">🐍</div>
      <div class="card-label">Snake</div>
      <div class="card-sub">Keyboard</div>
      <span class="badge">Play</span>
    </div>
    <div class="card" data-game="memory">
      <div class="card-icon">🃏</div>
      <div class="card-label">Memory Match</div>
      <div class="card-sub">Solo</div>
      <span class="badge">Play</span>
    </div>
    <div class="card" data-game="sudoku">
      <div class="card-icon">🔢</div>
      <div class="card-label">Sudoku</div>
      <div class="card-sub">Puzzle</div>
      <span class="badge">Play</span>
    </div>
  </div>

  <div id="log">▶ Webview ready. Waiting for your move…</div>

  <!--
    The nonce attribute MUST match the one in the CSP header above.
    Scripts without the correct nonce are blocked by the browser's sandbox.
  -->
  <script nonce="${nonce}">
    // acquireVsCodeApi() gives you the bridge object to talk back to the extension.
    // Call it ONCE and store the reference — calling it again throws an error.
    const vscode = acquireVsCodeApi();

    const log = document.getElementById('log');

    function appendLog(msg) {
      log.textContent += '\\n' + msg;
      log.scrollTop = log.scrollHeight;
    }

    // ── Listen for messages sent by the extension (panel.webview.postMessage) ──
    window.addEventListener('message', (event) => {
      const { command, payload } = event.data;
      appendLog(\`⬇ Extension says: \${command} \${payload ? '— ' + JSON.stringify(payload) : ''}\`);

      switch (command) {
        case 'ping':
          appendLog('🏓 Got pinged! Sending pong…');
          vscode.postMessage({ command: 'alert', payload: 'Pong from webview!' });
          break;
        // Add more handlers as you build out games
      }
    });

    // ── Game card clicks ───────────────────────────────────────────────────
    document.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('click', () => {
        const game = card.dataset.game;
        appendLog(\`🖱 Opening: \${game}\`);
        vscode.postMessage({ command: 'openGame', payload: game });
      });
    });

    // ── Restore state (retainContextWhenHidden) ────────────────────────────
    // VSCode can serialise and restore webview state across tab switches.
    const previousState = vscode.getState();
    if (previousState?.log) {
      log.textContent = previousState.log;
    }

    // Persist state on every log update
    const observer = new MutationObserver(() => {
      vscode.setState({ log: log.textContent });
    });
    observer.observe(log, { childList: true, characterData: true, subtree: true });

    // Signal to the extension that the webview has finished loading
    vscode.postMessage({ command: 'ready' });
    appendLog('✅ Sent "ready" to extension.');
  </script>
</body>
</html>`;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  private _dispose(): void {
    GamePanel._instance = undefined;
    this._panel.dispose();
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
  }
}

// ── Utility ──────────────────────────────────────────────────────────────────
function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
