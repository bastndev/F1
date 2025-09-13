import * as vscode from 'vscode';

export interface ShortcutItem {
  label: string;
  key: string;
  actions: {
    editorControls?: string[];  
    extensionCommands?: string[];
    installedExtensions?: string[];
  };
  isDefault?: boolean;
  description?: string; 
  id?: string; 
  createdAt?: Date; 
  lastUsed?: Date; 
}

export class MyListUI {
  private static _context: vscode.ExtensionContext;
  private static userShortcuts: ShortcutItem[] = [];
  private static onShortcutDeleted?: (key: string) => Promise<void>;

  static initialize(context: vscode.ExtensionContext): void {
    this._context = context;
    this.userShortcuts = this._context.globalState.get<ShortcutItem[]>('userShortcuts') || [];
    
    // Clean up invalid shortcuts on initialization
    this._cleanInvalidShortcuts();
  }

  /**
   * Validate if a shortcut key follows the allowed pattern (F2-F12 with ctrl/shift/ctrl+shift)
   */
  private static _isValidShortcutKey(key: string): boolean {
    const normalizedKey = key.toLowerCase();
    
    // Valid patterns: ctrl+f2-f12, shift+f2-f12, ctrl+shift+f2-f12
    // Note: F1 is excluded as it's reserved for built-in functionality
    const validPatterns = [
      /^ctrl\+f([2-9]|1[0-2])$/,           // ctrl+f2 to ctrl+f12
      /^shift\+f([2-9]|1[0-2])$/,          // shift+f2 to shift+f12
      /^ctrl\+shift\+f([2-9]|1[0-2])$/     // ctrl+shift+f2 to ctrl+shift+f12
    ];
    
    return validPatterns.some(pattern => pattern.test(normalizedKey));
  }

  /**
   * Clean up invalid shortcuts that may have been saved incorrectly
   */
  private static _cleanInvalidShortcuts(): void {
    const initialCount = this.userShortcuts.length;
    this.userShortcuts = this.userShortcuts.filter(shortcut => 
      this._isValidShortcutKey(shortcut.key)
    );
    
    const removedCount = initialCount - this.userShortcuts.length;
    if (removedCount > 0) {
      console.log(`F1 Extension: Cleaned up ${removedCount} invalid shortcut(s) on initialization`);
      this._saveShortcuts();
    }
  }

  static setOnShortcutDeleted(callback: (key: string) => Promise<void>): void {
    this.onShortcutDeleted = callback;
  }

  private static _saveShortcuts(): void {
    this._context.globalState.update('userShortcuts', this.userShortcuts);
  }

  static addShortcut(shortcut: ShortcutItem): void {
    if (!shortcut.id) {
      shortcut.id = `combo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    if (!shortcut.createdAt) {
      shortcut.createdAt = new Date();
    }

    this.userShortcuts.push(shortcut);
    this._saveShortcuts();
  }

  static getShortcutsByType(type: 'editorControls' | 'extensionCommands' | 'installedExtensions'): ShortcutItem[] {
    return this.userShortcuts.filter(shortcut => 
      shortcut.actions[type] && shortcut.actions[type]!.length > 0
    );
  }

  static shortcutExists(key: string): boolean {
    return this.userShortcuts.some(shortcut => shortcut.key === key);
  }

  static getShortcutStats(): {
    total: number;
    editorControls: number;
    extensionCommands: number;
    installedExtensions: number;
    combos: number;
  } {
    const total = this.userShortcuts.length;
    const editorControls = this.userShortcuts.filter(s => s.actions.editorControls?.length).length;
    const extensionCommands = this.userShortcuts.filter(s => s.actions.extensionCommands?.length).length;
    const installedExtensions = this.userShortcuts.filter(s => s.actions.installedExtensions?.length).length;
    const combos = this.userShortcuts.filter(s => 
      s.actions.editorControls?.length && s.actions.extensionCommands?.length
    ).length;

    return { total, editorControls, extensionCommands, installedExtensions, combos };
  }

  static generateShortcutsHTML(): string {
    const defaultShortcuts: ShortcutItem[] = [
      {
        label: 'Toggle word Wrap',
        key: 'F1',
        actions: { editorControls: ['editor.wordWrap'] },
        isDefault: true,
      },
      {
        label: 'AI suggestion (disable/enable)',
        key: 'Shift+F1',
        actions: { extensionCommands: ['f1.toggleAISuggestions'] },
        isDefault: true,
      },
    ];

    const generateShortcutItem = (shortcut: ShortcutItem, index?: number, isDefault = false) => `
      <div class="shortcut-item ${isDefault ? 'default' : 'user-delete'}" ${isDefault ? 'title="DEFAULT"' : `onclick="confirmDelete(${index}, '${shortcut.label}')"`}>
        <div class="shortcut-content">
          <span class="shortcut-label">${shortcut.label}</span>
          ${isDefault && shortcut.description ? `<span class="shortcut-description">${shortcut.description}</span>` : ''}
        </div>
        <span class="shortcut-key">${shortcut.key}</span>
      </div>
    `;

    return `
      <div class="shortcuts-container">
        ${defaultShortcuts.map(shortcut => generateShortcutItem(shortcut, undefined, true)).join('')}
        <div class="user-line"></div>
        ${this.userShortcuts.map((shortcut, index) => generateShortcutItem(shortcut, index)).join('')}
      </div>
    `;
  }

  static removeShortcut(index: number): void {
    if (index >= 0 && index < this.userShortcuts.length) {
      this.userShortcuts.splice(index, 1);
      this._saveShortcuts();
    }
  }

  static getUserShortcuts(): ShortcutItem[] {
    return this.userShortcuts;
  }

  static getShortcutById(id: string): ShortcutItem | undefined {
    return this.userShortcuts.find(shortcut => shortcut.id === id);
  }

  static updateShortcut(id: string, updates: Partial<ShortcutItem>): boolean {
    const index = this.userShortcuts.findIndex(shortcut => shortcut.id === id);
    if (index !== -1) {
      this.userShortcuts[index] = { ...this.userShortcuts[index], ...updates };
      return true;
    }
    return false;
  }

  static markAsUsed(id: string): void {
    const shortcut = this.getShortcutById(id);
    if (shortcut) {
      shortcut.lastUsed = new Date();
    }
  }

  static getRecentShortcuts(days: number = 7): ShortcutItem[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return this.userShortcuts
      .filter(shortcut => shortcut.lastUsed && shortcut.lastUsed > cutoffDate)
      .sort((a, b) => (b.lastUsed?.getTime() || 0) - (a.lastUsed?.getTime() || 0));
  }

  static getShortcutsByActionCount(minActions: number = 1): ShortcutItem[] {
    return this.userShortcuts.filter(shortcut => {
      const totalActions = (shortcut.actions.editorControls?.length || 0) + 
                          (shortcut.actions.extensionCommands?.length || 0) +
                          (shortcut.actions.installedExtensions?.length || 0);
      return totalActions >= minActions;
    });
  }

  static clearUserShortcuts(): void {
    this.userShortcuts = [];
  }

  static exportShortcuts(): string {
    return JSON.stringify(this.userShortcuts, null, 2);
  }

  static importShortcuts(jsonData: string): boolean {
    try {
      const imported = JSON.parse(jsonData);
      if (Array.isArray(imported)) {
        this.userShortcuts = imported;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error importing shortcuts:', error);
      return false;
    }
  }

  /**
   * Handle delete confirmation for shortcuts
   */
  static async confirmAndDeleteShortcut(index: number, label: string): Promise<boolean> {
    const result = await vscode.window.showInformationMessage(
      `Delete "${label}"?`,
      { modal: true },
      'Yes'
    );

    if (result === 'Yes') {
      // Get the shortcut before removing it to unregister the keybinding
      const shortcutToDelete = this.userShortcuts[index];
      
      // Remove from the list
      this.removeShortcut(index);
      
      // Also notify the dynamic shortcut manager if callback is set
      if (this.onShortcutDeleted && shortcutToDelete) {
        try {
          await this.onShortcutDeleted(shortcutToDelete.key);
        } catch (error) {
          console.warn('Could not remove from dynamic shortcut manager:', error);
        }
      }
      
      vscode.window.showInformationMessage(`🗑️ Deleted "${label}" shortcut`);
      return true;
    }
    return false;
  }
}