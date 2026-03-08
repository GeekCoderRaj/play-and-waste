/**
 * providers/GamesTreeProvider.ts — Sidebar Tree View.
 *
 * VSCode API concepts covered here:
 *  - TreeDataProvider<T>     : the interface you implement to feed a TreeView
 *  - TreeItem                : one node in the tree
 *  - TreeItemCollapsibleState: Expanded / Collapsed / None (leaf)
 *  - EventEmitter / Event    : fire-and-forget change notifications
 *  - ThemeIcon               : built-in codicon icons ($(name) syntax)
 *  - TreeItemCheckboxState   : optional checkboxes on tree items
 */

import * as vscode from "vscode";

// ── Data model ────────────────────────────────────────────────────────────────
type GameStatus = "available" | "coming-soon" | "wip";

interface GameEntry {
  id: string;
  label: string;
  icon: string;       // codicon name e.g. "game"
  status: GameStatus;
  description?: string;
  children?: GameEntry[];
}

const GAMES_DATA: GameEntry[] = [
  {
    id: "classic",
    label: "Classic Games",
    icon: "folder",
    status: "available",
    children: [
      {
        id: "tictactoe",
        label: "Tic Tac Toe",
        icon: "circle-outline",
        status: "coming-soon",
        description: "2 players",
      },
      {
        id: "snake",
        label: "Snake",
        icon: "terminal",
        status: "coming-soon",
        description: "Keyboard controlled",
      },
    ],
  },
  {
    id: "puzzles",
    label: "Puzzles",
    icon: "folder",
    status: "available",
    children: [
      {
        id: "memory",
        label: "Memory Match",
        icon: "symbol-misc",
        status: "available",
        description: "Flip cards",
      },
      {
        id: "sudoku",
        label: "Sudoku",
        icon: "symbol-numeric",
        status: "available",
        description: "9×9 grid",
      },
    ],
  },
];

// ── TreeItem subclass ─────────────────────────────────────────────────────────
export class GameTreeItem extends vscode.TreeItem {
  constructor(public readonly entry: GameEntry, hasChildren: boolean) {
    super(
      entry.label,
      hasChildren
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    // `description` appears dimmed next to the label
    this.description = entry.description ?? statusLabel(entry.status);

    // `tooltip` shows on hover — can be a MarkdownString for rich formatting
    this.tooltip = new vscode.MarkdownString(
      `**${entry.label}**\n\nStatus: _${entry.status}_\n\n${entry.description ?? ""}`
    );

    // `iconPath` can be a ThemeIcon (codicon), Uri, or { light, dark } paths
    this.iconPath = new vscode.ThemeIcon(
      entry.icon,
      entry.status === "available"
        ? new vscode.ThemeColor("terminal.ansiGreen")
        : new vscode.ThemeColor("terminal.ansiYellow")
    );

    // `contextValue` lets you conditionally show menus via "when" clauses
    // in package.json (e.g., "when": "viewItem == game-available")
    this.contextValue = `game-${entry.status}`;

    // Clicking a leaf item runs its specific command (or a fallback)
    if (!hasChildren) {
      this.command = {
        command: gameCommand(entry.id),
        title: entry.label,
        arguments: [entry.id],
      };
    }

    // Unique ID needed for stable selection/reveal between refreshes
    this.id = entry.id;
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────
export class GamesTreeProvider implements vscode.TreeDataProvider<GameTreeItem> {
  // EventEmitter<T | undefined> — firing undefined refreshes the whole tree
  private _onDidChangeTreeData = new vscode.EventEmitter<GameTreeItem | undefined | null>();

  // VSCode reads this property to subscribe to tree changes
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(_context: vscode.ExtensionContext) {}

  // Called when the user clicks the Refresh button (or you call refresh())
  refresh(item?: GameTreeItem): void {
    this._onDidChangeTreeData.fire(item ?? undefined);
  }

  // ── TreeDataProvider interface ─────────────────────────────────────────────
  // Returns the TreeItem VSCode should render for this element
  getTreeItem(element: GameTreeItem): vscode.TreeItem {
    return element;
  }

  // Returns the children of an element (or root items when element is undefined)
  getChildren(element?: GameTreeItem): GameTreeItem[] {
    const entries = element ? (element.entry.children ?? []) : GAMES_DATA;
    return entries.map((e) => new GameTreeItem(e, !!(e.children?.length)));
  }

  // Optional: used by treeView.reveal() to navigate the tree upward
  getParent(element: GameTreeItem): GameTreeItem | undefined {
    for (const root of GAMES_DATA) {
      const child = root.children?.find((c) => c.id === element.entry.id);
      if (child) {
        return new GameTreeItem(root, true);
      }
    }
    return undefined;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function gameCommand(id: string): string {
  const map: Record<string, string> = {
    tictactoe: "playAndWaste.playTicTacToe",
    snake:     "playAndWaste.playSnake",
    sudoku:    "playAndWaste.playSudoku",
    memory:    "playAndWaste.playMemory",
  };
  return map[id] ?? "playAndWaste.showQuickPick";
}

function statusLabel(status: GameStatus): string {
  switch (status) {
    case "available":  return "✅ Ready";
    case "coming-soon": return "🔜 Coming Soon";
    case "wip":        return "🚧 In Progress";
  }
}
