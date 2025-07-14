import * as vscode from 'vscode';

export interface FunctionKeyStatus {
  key: string;
  command: string;
  title: string;
  isActive: boolean;
  configKey: string;
}

export class FunctionKeyStatusProvider implements vscode.TreeDataProvider<FunctionKeyStatus> {
  private _onDidChangeTreeData: vscode.EventEmitter<FunctionKeyStatus | undefined | null | void> = new vscode.EventEmitter<FunctionKeyStatus | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FunctionKeyStatus | undefined | null | void> = this._onDidChangeTreeData.event;

  private functionKeys: FunctionKeyStatus[] = [
    {
      key: 'F1',
      command: 'shuu.toggleCodeFormatting',
      title: 'Word Wrap',
      isActive: false,
      configKey: 'editor.wordWrap'
    },
    {
      key: 'F2',
      command: 'shuu.toggleMinimap',
      title: 'Minimap',
      isActive: false,
      configKey: 'editor.minimap.enabled'
    },
    {
      key: 'F3',
      command: 'shuu.toggleFormatOnSave',
      title: 'Format On Save',
      isActive: false,
      configKey: 'editor.formatOnSave'
    },
    {
      key: 'F4',
      command: 'shuu.toggleAISuggestions',
      title: 'AI Suggestions',
      isActive: false,
      configKey: 'editor.inlineSuggest.enabled'
    },
    {
      key: 'F5',
      command: 'shuu.toggleHover',
      title: 'Hover',
      isActive: false,
      configKey: 'editor.hover.enabled'
    },
    {
      key: 'F6',
      command: 'shuu.toggleFolding',
      title: 'Code Folding',
      isActive: false,
      configKey: 'editor.folding'
    },
    {
      key: 'F7',
      command: 'shuu.toggleStickyScroll',
      title: 'Sticky Scroll',
      isActive: false,
      configKey: 'editor.stickyScroll.enabled'
    },
    {
      key: 'F8',
      command: 'shuu.toggleCompactFolders',
      title: 'Compact Folders',
      isActive: false,
      configKey: 'explorer.compactFolders'
    }
  ];

  constructor() {
    this.refreshStatus();
    
    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      this.refreshStatus();
    });
  }

  getTreeItem(element: FunctionKeyStatus): vscode.TreeItem {
    const statusIcon = element.isActive ? '🟢' : '🔴';
    const treeItem = new vscode.TreeItem(
      `${element.key} ${statusIcon} ${element.title}`,
      vscode.TreeItemCollapsibleState.None
    );
    
    // Set icon based on status using VS Code theme colors
    if (element.isActive) {
      treeItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
    } else {
      treeItem.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.red'));
    }
    
    // Create detailed tooltip
    const statusText = element.isActive ? 'Enabled ✅' : 'Disabled ❌';
    treeItem.tooltip = new vscode.MarkdownString(
      `**${element.key}**: ${element.title}\n\n` +
      `**Status**: ${statusText}\n\n` +
      `**Command**: \`${element.command}\`\n\n` +
      `Press **${element.key}** to toggle this feature`
    );
    
    // Add contextual description
    treeItem.description = `${statusIcon} ${element.isActive ? 'ON' : 'OFF'}`;
    
    return treeItem;
  }

  getChildren(element?: FunctionKeyStatus): Thenable<FunctionKeyStatus[]> {
    if (!element) {
      return Promise.resolve(this.functionKeys);
    }
    return Promise.resolve([]);
  }

  private async refreshStatus(): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    
    for (const key of this.functionKeys) {
      try {
        switch (key.configKey) {
          case 'editor.wordWrap':
            key.isActive = config.get('editor.wordWrap') === 'on';
            break;
          case 'editor.minimap.enabled':
            key.isActive = config.get('editor.minimap.enabled') as boolean || false;
            break;
          case 'editor.formatOnSave':
            key.isActive = config.get('editor.formatOnSave') as boolean || false;
            break;
          case 'editor.inlineSuggest.enabled':
            key.isActive = config.get('editor.inlineSuggest.enabled') as boolean || false;
            break;
          case 'editor.hover.enabled':
            key.isActive = config.get('editor.hover.enabled') as boolean || false;
            break;
          case 'editor.folding':
            key.isActive = config.get('editor.folding') as boolean || false;
            break;
          case 'editor.stickyScroll.enabled':
            key.isActive = config.get('editor.stickyScroll.enabled') as boolean || false;
            break;
          case 'explorer.compactFolders':
            key.isActive = config.get('explorer.compactFolders') as boolean || false;
            break;
          default:
            key.isActive = false;
        }
      } catch (error) {
        key.isActive = false;
      }
    }
    
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this.refreshStatus();
  }
}
