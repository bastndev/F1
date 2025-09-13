import * as vscode from 'vscode';
import { MyListUI, ShortcutItem } from './user-shortcuts';

export interface DynamicShortcut {
  key: string;
  command: string;
  disposable?: vscode.Disposable;
}

export class DynamicShortcutManager {
  private static instance: DynamicShortcutManager;
  private registeredShortcuts: Map<string, vscode.Disposable> = new Map();
  private shortcutMappings: Map<string, () => Promise<void>> = new Map();
  private context: vscode.ExtensionContext;
  private keyListener?: vscode.Disposable;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public static getInstance(context: vscode.ExtensionContext): DynamicShortcutManager {
    if (!DynamicShortcutManager.instance) {
      DynamicShortcutManager.instance = new DynamicShortcutManager(context);
    }
    return DynamicShortcutManager.instance;
  }

  /**
   * Initialize the dynamic shortcut manager
   */
  public async initialize(): Promise<void> {
    // Clean up invalid shortcuts from configuration first
    await this.cleanInvalidConfigShortcuts();
    
    // Register all user shortcuts
    await this.registerAllUserShortcuts();

    // Set up callback for when shortcuts are deleted
    MyListUI.setOnShortcutDeleted(async (key: string) => {
      await this.removeDynamicShortcut(key);
    });

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('f1.shortcuts')) {
        this.onConfigurationChanged();
      }
    });
  }

  /**
   * Clean up invalid shortcuts from configuration
   */
  private async cleanInvalidConfigShortcuts(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('f1');
      const configShortcuts = config.get<Record<string, string>>('shortcuts', {});
      let hasInvalidShortcuts = false;
      const cleanedShortcuts: Record<string, string> = {};

      for (const [key, command] of Object.entries(configShortcuts)) {
        if (this.isValidKeyBinding(key)) {
          cleanedShortcuts[key] = command;
        } else {
          hasInvalidShortcuts = true;
          console.log(`F1 Extension: Removing invalid shortcut from config: ${key}`);
        }
      }

      if (hasInvalidShortcuts) {
        await config.update('shortcuts', cleanedShortcuts, vscode.ConfigurationTarget.Global);
        console.log('F1 Extension: Cleaned up invalid shortcuts from configuration');
      }
    } catch (error) {
      console.error('Error cleaning invalid config shortcuts:', error);
    }
  }

  /**
   * Register all user shortcuts from the configuration and MyListUI
   */
  private async registerAllUserShortcuts(): Promise<void> {
    try {
      // Get shortcuts from configuration
      const config = vscode.workspace.getConfiguration('f1');
      const configShortcuts = config.get<Record<string, string>>('shortcuts', {});

      // Register shortcuts from configuration
      for (const [key, command] of Object.entries(configShortcuts)) {
        await this.registerShortcut(key, command);
      }

      // Get shortcuts from MyListUI
      const userShortcuts = MyListUI.getUserShortcuts();
      for (const shortcut of userShortcuts) {
        await this.registerShortcutFromItem(shortcut);
      }

    } catch (error) {
      console.error('Error registering user shortcuts:', error);
      vscode.window.showErrorMessage('Failed to register some shortcuts');
    }
  }

  /**
   * Register a single shortcut
   */
  private async registerShortcut(key: string, command: string): Promise<void> {
    try {
      // Unregister existing shortcut if it exists
      if (this.registeredShortcuts.has(key)) {
        this.unregisterShortcut(key);
      }

      // Validate the key format
      if (!this.isValidKeyBinding(key)) {
        console.warn(`Invalid key binding format: ${key}`);
        return;
      }

      // Create a disposable for this shortcut
      const disposable = vscode.commands.registerCommand(`f1.dynamic.${key.replace(/\+/g, '_')}`, async () => {
        await this.executeShortcutCommand(command);
      });

      // Store the disposable
      this.registeredShortcuts.set(key, disposable);
      this.context.subscriptions.push(disposable);

      // Try to register the keybinding
      await this.registerKeybinding(key, `f1.dynamic.${key.replace(/\+/g, '_')}`);

    } catch (error) {
      console.error(`Error registering shortcut ${key}:`, error);
    }
  }

  /**
   * Register a shortcut from a ShortcutItem
   */
  private async registerShortcutFromItem(shortcut: ShortcutItem): Promise<void> {
    try {
      const commandId = `f1.dynamic.shortcut.${shortcut.id}`;
      
      // Unregister existing shortcut if it exists
      if (this.registeredShortcuts.has(shortcut.key)) {
        this.unregisterShortcut(shortcut.key);
      }

      // Create a disposable for this shortcut
      const disposable = vscode.commands.registerCommand(commandId, async () => {
        await this.executeShortcutItem(shortcut);
      });

      // Store the disposable
      this.registeredShortcuts.set(shortcut.key, disposable);
      this.context.subscriptions.push(disposable);

      // Try to register the keybinding
      await this.registerKeybinding(shortcut.key, commandId);

    } catch (error) {
      console.error(`Error registering shortcut item ${shortcut.label}:`, error);
    }
  }

  /**
   * Execute a shortcut command
   */
  private async executeShortcutCommand(command: string): Promise<void> {
    try {
      // Check if it's a built-in VS Code command
      if (command.startsWith('workbench.') || command.startsWith('editor.') || command.startsWith('git.')) {
        await vscode.commands.executeCommand(command);
      } 
      // Check if it's an F1 command
      else if (command.startsWith('f1.')) {
        await vscode.commands.executeCommand(command);
      }
      // Check if it's a configuration toggle
      else if (this.isConfigurationKey(command)) {
        await this.toggleConfiguration(command);
      }
      else {
        // Try to execute as a generic command
        await vscode.commands.executeCommand(command);
      }
    } catch (error) {
      console.error(`Error executing command ${command}:`, error);
      vscode.window.showErrorMessage(`Failed to execute command: ${command}`);
    }
  }

  /**
   * Execute a shortcut item with multiple actions
   */
  private async executeShortcutItem(shortcut: ShortcutItem): Promise<void> {
    try {
      MyListUI.markAsUsed(shortcut.id!);

      let actionsExecuted = 0;

      // Execute editor controls
      if (shortcut.actions.editorControls?.length) {
        for (const configKey of shortcut.actions.editorControls) {
          await this.toggleConfiguration(configKey);
          actionsExecuted++;
        }
      }

      // Execute extension commands
      if (shortcut.actions.extensionCommands?.length) {
        for (const command of shortcut.actions.extensionCommands) {
          try {
            await vscode.commands.executeCommand(command);
            actionsExecuted++;
          } catch (error) {
            console.warn(`Failed to execute command ${command}:`, error);
          }
        }
      }

      // Handle installed extensions
      if (shortcut.actions.installedExtensions?.length) {
        for (const extensionId of shortcut.actions.installedExtensions) {
          try {
            const extension = vscode.extensions.getExtension(extensionId);
            if (extension) {
              vscode.window.showInformationMessage(
                `Extension: ${extension.packageJSON.displayName || extension.packageJSON.name} - ${extension.isActive ? 'Active' : 'Inactive'}`
              );
              actionsExecuted++;
            }
          } catch (error) {
            console.warn(`Failed to process extension ${extensionId}:`, error);
          }
        }
      }

      if (actionsExecuted > 0) {
        vscode.window.showInformationMessage(
          `✅ Executed "${shortcut.label}" (${actionsExecuted} actions)`
        );
      }

    } catch (error) {
      console.error('Error executing shortcut item:', error);
      vscode.window.showErrorMessage(`Error executing shortcut: ${error}`);
    }
  }

  /**
   * Toggle a configuration value
   */
  private async toggleConfiguration(configKey: string): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration();
      const currentValue = config.get(configKey);

      let newValue: any;

      if (typeof currentValue === 'boolean') {
        newValue = !currentValue;
      } else if (configKey === 'editor.lineNumbers') {
        newValue = currentValue === 'on' ? 'off' : 'on';
      } else if (configKey === 'files.autoSave') {
        newValue = currentValue === 'off' ? 'afterDelay' : 'off';
      } else if (configKey === 'editor.cursorBlinking') {
        newValue = currentValue === 'blink' ? 'solid' : 'blink';
      } else if (configKey === 'editor.acceptSuggestionOnEnter') {
        newValue = currentValue === 'on' ? 'off' : 'on';
      } else {
        newValue = !currentValue;
      }

      await config.update(
        configKey,
        newValue,
        vscode.ConfigurationTarget.Global
      );

      // Show feedback
      const readableName = this.getReadableConfigName(configKey);
      vscode.window.showInformationMessage(
        `${readableName}: ${this.formatConfigValue(newValue)}`
      );

    } catch (error) {
      console.warn(`Failed to toggle ${configKey}:`, error);
    }
  }

  /**
   * Register a keybinding dynamically
   */
  private async registerKeybinding(key: string, command: string): Promise<void> {
    try {
      // VS Code doesn't allow dynamic keybinding registration through API
      // This would require updating keybindings.json or using the settings
      // For now, we'll save it to the user's settings for manual addition to keybindings.json
      
      const config = vscode.workspace.getConfiguration('f1');
      const shortcuts = config.get<Record<string, string>>('shortcuts', {});
      
      if (!shortcuts[key]) {
        shortcuts[key] = command;
        await config.update('shortcuts', shortcuts, vscode.ConfigurationTarget.Global);
      }

    } catch (error) {
      console.warn(`Could not register keybinding for ${key}:`, error);
    }
  }

  /**
   * Unregister a shortcut
   */
  private unregisterShortcut(key: string): void {
    const disposable = this.registeredShortcuts.get(key);
    if (disposable) {
      disposable.dispose();
      this.registeredShortcuts.delete(key);
    }
  }

  /**
   * Handle configuration changes
   */
  private async onConfigurationChanged(): Promise<void> {
    // Unregister all existing shortcuts
    for (const [key, disposable] of this.registeredShortcuts) {
      disposable.dispose();
    }
    this.registeredShortcuts.clear();

    // Re-register all shortcuts
    await this.registerAllUserShortcuts();
  }

  /**
   * Force re-registration of all shortcuts (useful when new shortcuts are added)
   */
  public async forceReregister(): Promise<void> {
    await this.onConfigurationChanged();
  }

  /**
   * Add a new dynamic shortcut
   */
  public async addDynamicShortcut(key: string, command: string): Promise<boolean> {
    try {
      // Validate the key
      if (!this.isValidKeyBinding(key)) {
        vscode.window.showErrorMessage(`Invalid key binding format: ${key}`);
        return false;
      }

      // Check if key already exists
      if (this.registeredShortcuts.has(key)) {
        const result = await vscode.window.showWarningMessage(
          `Shortcut ${key} already exists. Replace it?`,
          'Yes', 'No'
        );
        if (result !== 'Yes') {
          return false;
        }
      }

      // Register the shortcut
      await this.registerShortcut(key, command);

      // Update configuration - create a new object instead of modifying the proxy
      const config = vscode.workspace.getConfiguration('f1');
      const currentShortcuts = config.get<Record<string, string>>('shortcuts', {});
      const newShortcuts = { ...currentShortcuts };
      newShortcuts[key] = command;
      await config.update('shortcuts', newShortcuts, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage(`Shortcut ${key} registered successfully!`);
      return true;

    } catch (error) {
      console.error('Error adding dynamic shortcut:', error);
      vscode.window.showErrorMessage(`Failed to add shortcut: ${error}`);
      return false;
    }
  }

  /**
   * Remove a dynamic shortcut
   */
  public async removeDynamicShortcut(key: string): Promise<boolean> {
    try {
      // Unregister the shortcut
      this.unregisterShortcut(key);

      // Update configuration - create a new object instead of modifying the proxy
      const config = vscode.workspace.getConfiguration('f1');
      const currentShortcuts = config.get<Record<string, string>>('shortcuts', {});
      const newShortcuts = { ...currentShortcuts };
      delete newShortcuts[key];
      await config.update('shortcuts', newShortcuts, vscode.ConfigurationTarget.Global);

      console.log(`Shortcut ${key} removed successfully!`);
      return true;

    } catch (error) {
      console.error('Error removing dynamic shortcut:', error);
      vscode.window.showErrorMessage(`Failed to remove shortcut: ${error}`);
      return false;
    }
  }

  /**
   * Validate key binding format
   * Only allows F2-F12 with ctrl, shift, or ctrl+shift combinations (F1 is reserved)
   */
  private isValidKeyBinding(key: string): boolean {
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
   * Check if a string is a configuration key
   */
  private isConfigurationKey(key: string): boolean {
    return key.includes('.') && !key.startsWith('workbench.') && !key.startsWith('f1.');
  }

  /**
   * Get readable name for configuration
   */
  private getReadableConfigName(configKey: string): string {
    const nameMap: Record<string, string> = {
      'editor.minimap.enabled': 'Minimap',
      'editor.folding': 'Code Folding',
      'editor.lineNumbers': 'Line Numbers',
      'editor.cursorBlinking': 'Cursor Blinking',
      'editor.colorDecorators': 'Color Decorators',
      'editor.renderIndentGuides': 'Indent Guides',
      'editor.stickyScroll.enabled': 'Sticky Scroll',
      'editor.cursorSmoothCaretAnimation': 'Smooth Caret Animation',
      'terminal.integrated.suggest.enabled': 'Terminal Suggest',
      'editor.bracketPairColorization.enabled': 'Bracket Pair Colorization',
      'breadcrumbs.enabled': 'Breadcrumbs',
      'explorer.compactFolders': 'Compact Folders',
      'files.autoSave': 'Auto Save',
      'editor.formatOnPaste': 'Format On Paste',
      'editor.formatOnSave': 'Format On Save',
      'editor.formatOnType': 'Format On Type',
      'files.insertFinalNewline': 'Insert Final Newline',
      'files.trimTrailingWhitespace': 'Trim Trailing Whitespace'
    };

    return nameMap[configKey] || configKey;
  }

  /**
   * Format configuration value for display
   */
  private formatConfigValue(value: any): string {
    if (typeof value === 'boolean') {
      return value ? 'Enabled' : 'Disabled';
    }
    if (value === 'on' || value === 'afterDelay') {
      return 'Enabled';
    }
    if (value === 'off') {
      return 'Disabled';
    }
    return String(value);
  }

  /**
   * Get all registered shortcuts
   */
  public getRegisteredShortcuts(): string[] {
    return Array.from(this.registeredShortcuts.keys());
  }

  /**
   * Dispose all shortcuts
   */
  public dispose(): void {
    for (const [, disposable] of this.registeredShortcuts) {
      disposable.dispose();
    }
    this.registeredShortcuts.clear();
  }
}