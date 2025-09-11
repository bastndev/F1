import * as vscode from 'vscode';
import { IconManager } from './ed-icons';

interface EditorControl {
  name: string;
  category: 'editor' | 'ui' | 'formatting' | 'features' | 'debugging';
  configKey?: string;
  isSeparator?: boolean;
}

class EditorControlsProvider implements vscode.TreeDataProvider<EditorControl> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    EditorControl | undefined | null | void
  > = new vscode.EventEmitter<EditorControl | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    EditorControl | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private controls: EditorControl[] = [
    // Editor Visual Features
    // Separator
    {name: 'Editor Features',category: 'editor',isSeparator: true,},

    {name: 'Minimap',category: 'editor',configKey: 'editor.minimap.enabled',},
    {name: 'Code Folding',category: 'editor',configKey: 'editor.folding',},
    {name: 'Line Numbers',category: 'editor',configKey: 'editor.lineNumbers',},
    {name: 'Cursor Blinking',category: 'editor',configKey: 'editor.cursorBlinking',},
    {name: 'Color Decorators',category: 'editor',configKey: 'editor.colorDecorators',},
    {name: 'Indent Guides',category: 'editor',configKey: 'editor.guides.indentation',},
    {name: 'Sticky Scroll',category: 'editor',configKey: 'editor.stickyScroll.enabled',},
    {name: 'Cursor Smooth Caret Animation',category: 'editor',configKey: 'editor.cursorSmoothCaretAnimation',},
    {name: 'Bracket Pair Colorization',category: 'editor',configKey: 'editor.bracketPairColorization.enabled',},

    // Separator
    {name: 'Editor Features',category: 'ui',isSeparator: true,},

    // UI Features
    {name: 'Activity Bar',category: 'ui',configKey: 'workbench.activityBar.visible',},
    {name: 'Breadcrumbs',category: 'ui',configKey: 'breadcrumbs.enabled',},
    {name: 'Compact Folders',category: 'ui',configKey: 'explorer.compactFolders',},
    {name: 'Panel',category: 'ui',configKey: 'workbench.panel.defaultLocation',},
    {name: 'Side Bar',category: 'ui',configKey: 'workbench.sideBar.location',},
    {name: 'Status Bar',category: 'ui',configKey: 'workbench.statusBar.visible',},
    {name: 'Tabs',category: 'ui',configKey: 'workbench.editor.showTabs',},
    {name: 'Tree Indent',category: 'ui',configKey: 'workbench.tree.indent',},

    // Separator
    {name: 'UI Components',category: 'formatting',isSeparator: true,},

    // Formatting & Code Features
    {name: 'Auto Save',category: 'formatting',configKey: 'files.autoSave',},
    {name: 'Format On Paste',category: 'formatting',configKey: 'editor.formatOnPaste',},
    {name: 'Format On Save',category: 'formatting',configKey: 'editor.formatOnSave',},
    {name: 'Format On Type',category: 'formatting',configKey: 'editor.formatOnType',},
    {name: 'Insert Final Newline',category: 'formatting',configKey: 'files.insertFinalNewline',},
    {name: 'Trim Trailing Whitespace',category: 'formatting',configKey: 'files.trimTrailingWhitespace',},

    // Separator
    {name: 'Formatting Options',category: 'features',isSeparator: true,},

    // IntelliSense & Features
    {name: 'Accept Suggestion On Enter',category: 'features',configKey: 'editor.acceptSuggestionOnEnter',},
    {name: 'Auto Closing Brackets',category: 'features',configKey: 'editor.autoClosingBrackets',},
    {name: 'Auto Closing Quotes',category: 'features',configKey: 'editor.autoClosingQuotes',},
    {name: 'Auto Surround Selection',category: 'features',configKey: 'editor.autoSurround',},
    {name: 'Code Lens',category: 'features',configKey: 'editor.codeLens',},
    {name: 'Git Auto Fetch',category: 'features',configKey: 'git.autofetch',},
    {name: 'Git Decorations',category: 'features',configKey: 'git.decorations.enabled',},
    {name: 'Hover',category: 'features',configKey: 'editor.hover.enabled',},
    {name: 'IntelliSense',category: 'features',configKey: 'editor.quickSuggestions',},
    {name: 'Parameter Hints',category: 'features',configKey: 'editor.parameterHints.enabled',},
    {name: 'Suggest On Trigger Characters',category: 'features',configKey: 'editor.suggestOnTriggerCharacters',},

    // Separator
    {name: 'Advanced Features',category: 'debugging',isSeparator: true,},

    // Debugging & Terminal
    {name: 'Debug Console',category: 'debugging',configKey: 'debug.console.fontSize',},
    {name: 'Inline Values',category: 'debugging',configKey: 'debug.inlineValues',},
    {name: 'Terminal Cursor Blinking',category: 'debugging',configKey: 'terminal.integrated.cursorBlinking',},
  ];

  // Category icons mapping
  private categoryIcons = {
    editor: 'edit',
    ui: 'layout',
    formatting: 'symbol-ruler',
    features: 'zap',
    debugging: 'debug-alt',
  };

  /**
   * Gets the current configuration value for a control
   */
  private getCurrentConfigValue(configKey: string): any {
    const config = vscode.workspace.getConfiguration();
    return config.get(configKey);
  }

  /**
   * Gets a human-readable status for the current configuration value
   */
  private getStatusText(configKey: string): string {
    const currentValue = this.getCurrentConfigValue(configKey);
    const isEnabled = this.isValueEnabled(currentValue);
    
    return isEnabled ? 'Enabled' : 'Disabled';
  }

  getTreeItem(element: EditorControl): vscode.TreeItem {
    if (element.isSeparator) {
      const item = new vscode.TreeItem('');
      
      // Enhanced separator display with only category icon
      const categoryIcon = this.categoryIcons[element.category] || 'symbol-misc';
      item.description = ':::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::';
      
      // Style separator differently
      item.contextValue = 'separator';
      item.collapsibleState = vscode.TreeItemCollapsibleState.None;
      
      // Add tooltip for separator
      const tooltip = new vscode.MarkdownString(`$(${categoryIcon}) **${element.category.toUpperCase()}**`);
      tooltip.supportThemeIcons = true;
      item.tooltip = tooltip;
      
      // Use category icon for separator
      item.iconPath = new vscode.ThemeIcon(categoryIcon, new vscode.ThemeColor('editorInfo.foreground'));
      
      return item;
    }

    // Use only the control name without status
    const item = new vscode.TreeItem(element.name);
    
    // Get category icon
    const categoryIcon = this.categoryIcons[element.category] || 'gear';
    
    // Enhanced tooltip with category icon, name, status and click instruction
    let tooltipContent = `$(${categoryIcon}) **${element.name}**\n\nCategory: ${element.category}`;
    
    if (element.configKey) {
      const currentValue = this.getCurrentConfigValue(element.configKey);
      const statusText = this.getStatusText(element.configKey);
      
      tooltipContent += `\n\nStatus: **${statusText}**`;
      tooltipContent += `\nCurrent value: \`${currentValue}\``;
      tooltipContent += `\n\n$(mouse) 💡 Click to (**activate/deactivate**)`;
    }
    
    const tooltip = new vscode.MarkdownString(tooltipContent);
    tooltip.supportThemeIcons = true;
    item.tooltip = tooltip;

    // Add icon and make items clickable if they have a configKey
    if (element.configKey) {
      // Set the icon based on current state (from IconManager)
      item.iconPath = IconManager.getControlIcon(element.configKey);

      item.command = {
        command: 'f1-editor-controls.toggleControl',
        title: 'Toggle Control',
        arguments: [element.name],
      };
    } else {
      // For items without configKey, use the category icon
      item.iconPath = new vscode.ThemeIcon(categoryIcon);
    }

    return item;
  }

  getChildren(): EditorControl[] {
    // Return without sorting alphabetically
    return this.controls;
  }

  // Methods for future implementation
  getControlsByCategory(category: string): EditorControl[] {
    return this.controls.filter((control) => control.category === category && !control.isSeparator);
  }

  getControlByName(name: string): EditorControl | undefined {
    return this.controls.find((control) => control.name === name);
  }

  /**
   * Gets all separators
   */
  getSeparators(): EditorControl[] {
    return this.controls.filter((control) => control.isSeparator);
  }

  /**
   * Toggles a control's configuration value
   */
  async toggleControl(controlName: string): Promise<void> {
    const control = this.getControlByName(controlName);

    if (!control || !control.configKey || control.isSeparator) {
      return;
    }

    try {
      const config = vscode.workspace.getConfiguration();
      const currentValue = config.get(control.configKey);

      // Handle different types of configuration values
      let newValue: any;

      if (typeof currentValue === 'boolean') {
        newValue = !currentValue;
      } else if (control.configKey === 'editor.lineNumbers') {
        // Special case for line numbers: 'on' | 'off' | 'relative' | 'interval'
        newValue = currentValue === 'on' ? 'off' : 'on';
      } else if (control.configKey === 'files.autoSave') {
        // Special case for auto save: 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange'
        newValue = currentValue === 'off' ? 'afterDelay' : 'off';
      } else if (control.configKey === 'editor.cursorBlinking') {
        // Special case for cursor blinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
        newValue = currentValue === 'blink' ? 'solid' : 'blink';
      } else if (control.configKey === 'editor.acceptSuggestionOnEnter') {
        // Special case: 'on' | 'smart' | 'off'
        newValue = currentValue === 'on' ? 'off' : 'on';
      } else {
        // For other non-boolean values, try to toggle between enabled/disabled states
        newValue = !currentValue;
      }

      await config.update(
        control.configKey,
        newValue,
        vscode.ConfigurationTarget.Global
      );

      // Refresh tree view to update the status
      this._onDidChangeTreeData.fire();

    } catch (error) {
      // Show error notification only for actual errors
      vscode.window.showErrorMessage(`Failed to toggle ${controlName}: ${error}`);
      console.error(`Failed to toggle ${controlName}:`, error);
    }
  }

  /**
   * Determines if a configuration value represents an "enabled" state
   */
  private isValueEnabled(value: any): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    // Handle string values that represent enabled/disabled states
    const enabledValues = [
      'on',
      'afterDelay',
      'onFocusChange',
      'onWindowChange',
      'blink',
      'smart',
    ];
    const disabledValues = ['off', 'solid'];

    if (typeof value === 'string') {
      if (enabledValues.includes(value)) {
        return true;
      }
      if (disabledValues.includes(value)) {
        return false;
      }
    }

    // Default: treat truthy values as enabled
    return !!value;
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new EditorControlsProvider();

  // Register tree data provider
  vscode.window.registerTreeDataProvider('f1-editor-controls', provider);

  // Register toggle command
  const toggleCommand = vscode.commands.registerCommand(
    'f1-editor-controls.toggleControl',
    (controlName: string) => provider.toggleControl(controlName)
  );

  // Register refresh command
  const refreshCommand = vscode.commands.registerCommand(
    'f1-editor-controls.refresh',
    () => provider.refresh()
  );

  context.subscriptions.push(toggleCommand, refreshCommand);
}

export function deactivate() {}