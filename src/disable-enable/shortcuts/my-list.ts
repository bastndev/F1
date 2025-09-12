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
  private static userShortcuts: ShortcutItem[] = [
    // Empty list - the user will create their own shortcuts
  ];

  /**
   * Add a new shortcut combo
   */
  static addShortcut(shortcut: ShortcutItem): void {
    // Generate unique ID if not provided
    if (!shortcut.id) {
      shortcut.id = `combo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Set creation timestamp
    if (!shortcut.createdAt) {
      shortcut.createdAt = new Date();
    }
    
    this.userShortcuts.push(shortcut);
  }

  /**
   * Get shortcuts by action type
   */
  static getShortcutsByType(type: 'editorControls' | 'extensionCommands' | 'installedExtensions'): ShortcutItem[] {
    return this.userShortcuts.filter(shortcut => 
      shortcut.actions[type] && shortcut.actions[type]!.length > 0
    );
  }

  /**
   * Validate if a shortcut already exists
   */
  static shortcutExists(key: string): boolean {
    return this.userShortcuts.some(shortcut => shortcut.key === key);
  }

  /**
   * Get shortcut statistics
   */
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

    return `
            <div class="shortcuts-container">
                ${defaultShortcuts
                  .map(
                    (shortcut) => `
                    <div class="shortcut-item default" title="DEFAULT">
                        <div class="shortcut-content">
                            <span class="shortcut-label">${shortcut.label}</span>
                            ${shortcut.description ? `<span class="shortcut-description">${shortcut.description}</span>` : ''}
                        </div>
                        <span class="shortcut-key">${shortcut.key}</span>
                    </div>
                `
                  )
                  .join('')}
                
                <div class="user-line"></div>
                
                ${this.userShortcuts
                  .map(
                    (shortcut, index) => `
                    <div class="shortcut-item user-delete" onclick="confirmDelete(${index}, '${shortcut.label}')">
                        <div class="shortcut-content">
                            <span class="shortcut-label">${shortcut.label}</span>
                        </div>
                        <span class="shortcut-key">${shortcut.key}</span>
                    </div>
                `
                  )
                  .join('')}
            </div>
        `;
  }

  static removeShortcut(index: number): void {
    if (index >= 0 && index < this.userShortcuts.length) {
      this.userShortcuts.splice(index, 1);
    }
  }

  static getUserShortcuts(): ShortcutItem[] {
    return this.userShortcuts;
  }

  /**
   * Get shortcut by ID
   */
  static getShortcutById(id: string): ShortcutItem | undefined {
    return this.userShortcuts.find(shortcut => shortcut.id === id);
  }

  /**
   * Update shortcut by ID
   */
  static updateShortcut(id: string, updates: Partial<ShortcutItem>): boolean {
    const index = this.userShortcuts.findIndex(shortcut => shortcut.id === id);
    if (index !== -1) {
      this.userShortcuts[index] = { ...this.userShortcuts[index], ...updates };
      return true;
    }
    return false;
  }

  /**
   * Mark shortcut as used (update lastUsed timestamp)
   */
  static markAsUsed(id: string): void {
    const shortcut = this.getShortcutById(id);
    if (shortcut) {
      shortcut.lastUsed = new Date();
    }
  }

  /**
   * Get recently used shortcuts (last 7 days)
   */
  static getRecentShortcuts(days: number = 7): ShortcutItem[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return this.userShortcuts
      .filter(shortcut => shortcut.lastUsed && shortcut.lastUsed > cutoffDate)
      .sort((a, b) => (b.lastUsed?.getTime() || 0) - (a.lastUsed?.getTime() || 0));
  }

  /**
   * Get shortcuts by action count (for filtering)
   */
  static getShortcutsByActionCount(minActions: number = 1): ShortcutItem[] {
    return this.userShortcuts.filter(shortcut => {
      const totalActions = (shortcut.actions.editorControls?.length || 0) + 
                          (shortcut.actions.extensionCommands?.length || 0) +
                          (shortcut.actions.installedExtensions?.length || 0);
      return totalActions >= minActions;
    });
  }

  /**
   * Clear all user shortcuts (keep defaults)
   */
  static clearUserShortcuts(): void {
    this.userShortcuts = [];
  }

  /**
   * Export shortcuts to JSON
   */
  static exportShortcuts(): string {
    return JSON.stringify(this.userShortcuts, null, 2);
  }

  /**
   * Import shortcuts from JSON
   */
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
}