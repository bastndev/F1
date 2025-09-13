import * as vscode from 'vscode';
import { IconManager } from './ed-icons';

interface EditorControl {
  name: string;
  category: 'editor' | 'ui' | 'formatting' | 'features' | 'debugging';
  configKey?: string;
  isSeparator?: boolean;
  isNew?: boolean;
  description?: string;
}

class EditorControlsProvider implements vscode.TreeDataProvider<EditorControl> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    EditorControl | undefined | null | void
  > = new vscode.EventEmitter<EditorControl | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    EditorControl | undefined | null | void
  > = this._onDidChangeTreeData.event;

  // Static controls array to avoid duplication
  public static readonly controls: EditorControl[] = [
    // Editor Visual Features
    // Separator
    // {name: 'Editor Features',category: 'editor',isSeparator: true,description: 'Categorizes editor visual features',},

    {name: 'Minimap',category: 'editor',configKey: 'editor.minimap.enabled',description: 'DESCRIPTION: Displays a miniature overview of the file on the right side of the editor for quick navigation.',},
    {name: 'Code Folding',category: 'editor',configKey: 'editor.folding',description: 'DESCRIPTION: Enables collapsing and expanding sections of code to improve readability.',},
    {name: 'Line Numbers',category: 'editor',configKey: 'editor.lineNumbers',description: 'DESCRIPTION: Shows line numbers in the editor gutter.',},
    {name: 'Cursor Blinking',category: 'editor',configKey: 'editor.cursorBlinking',description: 'DESCRIPTION: Controls the blinking animation of the text cursor.',},
    {name: 'Color Decorators',category: 'editor',configKey: 'editor.colorDecorators',description: 'DESCRIPTION: Displays color previews for color values in the code.',},
    {name: 'Indent Guides',category: 'editor',configKey: 'editor.guides.indentation',description: 'DESCRIPTION: Shows vertical lines to indicate indentation levels.',},
    {name: 'Sticky Scroll',category: 'editor',configKey: 'editor.stickyScroll.enabled',description: 'DESCRIPTION: Keeps the current code scope visible at the top of the editor.',},
    {name: 'Cursor Smooth Caret Animation',category: 'editor',configKey: 'editor.cursorSmoothCaretAnimation',description: 'DESCRIPTION: Enables smooth animation for cursor movement.',},
    {name: 'Terminal Suggest',category: 'editor',configKey: 'terminal.integrated.suggest.enabled',description: 'DESCRIPTION: Provides IntelliSense suggestions in the integrated terminal.', isNew: true}, // new

    // Separator
    {name: 'Editor Features',category: 'ui',isSeparator: true,description: 'DESCRIPTION: Categorizes user interface features.',},

    // UI Features
    {name: 'Bracket LINE Colorization',category: 'ui',configKey: 'editor.guides.bracketPairs',description: 'DESCRIPTION: Colors the lines connecting matching brackets.',},
    {name: 'Bracket PAIR Colorization',category: 'ui',configKey: 'editor.bracketPairColorization.enabled',description: 'DESCRIPTION: Colors matching bracket pairs for better visibility.',},
    {name: 'Breadcrumbs',category: 'ui',configKey: 'breadcrumbs.enabled',description: 'DESCRIPTION: Shows the current file location in the navigation hierarchy.',},
    {name: 'Compact Folders',category: 'ui',configKey: 'explorer.compactFolders',description: 'DESCRIPTION: Compacts single-child folders in the explorer view.',},
    {name: 'Panel',category: 'ui',configKey: 'workbench.panel.defaultLocation',description: 'DESCRIPTION: Sets the default location of the panel (bottom or right).',},
    {name: 'Side Bar',category: 'ui',configKey: 'workbench.sideBar.location',description: 'DESCRIPTION: Sets the location of the side bar (left or right).',},
    {name: 'Status Bar',category: 'ui',configKey: 'workbench.statusBar.visible',description: 'DESCRIPTION: Shows or hides the status bar at the bottom.',},
    {name: 'Tabs',category: 'ui',configKey: 'workbench.editor.showTabs',description: 'DESCRIPTION: Shows or hides editor tabs.',},
    {name: 'Tree Indent',category: 'ui',configKey: 'workbench.tree.indent',description: 'DESCRIPTION: Sets the indentation level for tree views.',},

    // Separator
    {name: 'UI Components',category: 'formatting',isSeparator: true,description: 'DESCRIPTION: Categorizes formatting and code features.',},

    // Formatting & Code Features
    {name: 'Auto Save',category: 'formatting',configKey: 'files.autoSave',description: 'DESCRIPTION: Automatically saves files after changes.',},
    {name: 'Format On Paste',category: 'formatting',configKey: 'editor.formatOnPaste',description: 'DESCRIPTION: Formats code automatically when pasting.',},
    {name: 'Format On Save',category: 'formatting',configKey: 'editor.formatOnSave',description: 'DESCRIPTION: Formats code automatically when saving files.',},
    {name: 'Format On Type',category: 'formatting',configKey: 'editor.formatOnType',description: 'DESCRIPTION: Formats code as you type.',},
    {name: 'Insert Final Newline',category: 'formatting',configKey: 'files.insertFinalNewline',description: 'DESCRIPTION: Adds a newline at the end of files.',},
    {name: 'Trim Trailing Whitespace',category: 'formatting',configKey: 'files.trimTrailingWhitespace',description: 'DESCRIPTION: Removes trailing whitespace from lines.',},

    // Separator
    {name: 'Formatting Options',category: 'features',isSeparator: true,description: 'DESCRIPTION: Categorizes IntelliSense and advanced features.',},

    // IntelliSense & Features
    {name: 'Accept Suggestion On Enter',category: 'features',configKey: 'editor.acceptSuggestionOnEnter',description: 'DESCRIPTION: Accepts IntelliSense suggestions when pressing Enter.',},
    {name: 'Auto Closing Brackets',category: 'features',configKey: 'editor.autoClosingBrackets',description: 'DESCRIPTION: Automatically closes brackets when typing.',},
    {name: 'Auto Closing Quotes',category: 'features',configKey: 'editor.autoClosingQuotes',description: 'DESCRIPTION: Automatically closes quotes when typing.',},
    {name: 'Auto Surround Selection',category: 'features',configKey: 'editor.autoSurround',description: 'DESCRIPTION: Surrounds selected text with brackets or quotes.',},
    {name: 'Code Lens',category: 'features',configKey: 'editor.codeLens',description: 'DESCRIPTION: Shows code lens information above code elements.',},
    {name: 'Git Auto Fetch',category: 'features',configKey: 'git.autofetch',description: 'DESCRIPTION: Automatically fetches changes from Git repositories.',},
    {name: 'Git Decorations',category: 'features',configKey: 'git.decorations.enabled',description: 'DESCRIPTION: Shows Git status indicators in the editor.',},
    {name: 'Hover',category: 'features',configKey: 'editor.hover.enabled',description: 'DESCRIPTION: Shows hover information for code elements.',},
    {name: 'IntelliSense',category: 'features',configKey: 'editor.quickSuggestions',description: 'DESCRIPTION: Provides quick code completion suggestions.',},
    {name: 'Parameter Hints',category: 'features',configKey: 'editor.parameterHints.enabled',description: 'DESCRIPTION: Shows parameter information in function calls.',},
    {name: 'Suggest On Trigger Characters',category: 'features',configKey: 'editor.suggestOnTriggerCharacters',description: 'DESCRIPTION: Triggers suggestions when typing special characters.',},

    // Separator
    {name: 'Advanced Features',category: 'debugging',isSeparator: true,description: 'DESCRIPTION: Categorizes debugging and terminal features.',},

    // Debugging & Terminal
    {name: 'Debug Console',category: 'debugging',configKey: 'debug.console.fontSize',description: 'DESCRIPTION: Sets the font size for the debug console.',},
    {name: 'Inline Values',category: 'debugging',configKey: 'debug.inlineValues',description: 'DESCRIPTION: Shows variable values inline during debugging.',},
    {name: 'Terminal Cursor Blinking',category: 'debugging',configKey: 'terminal.integrated.cursorBlinking',description: 'DESCRIPTION: Controls cursor blinking in the integrated terminal.',},
  ];

  // Instance property that references the static array
  public controls: EditorControl[] = EditorControlsProvider.controls;

  // Category icons mapping
  private categoryIcons = {
    editor: 'edit',
    ui: 'layout',
    formatting: 'symbol-ruler',
    features: 'zap',
    debugging: 'debug-alt',
  };

  /**
   *  --- --- -- - NEW 
   */
  private createNewBadge(): string {
    return ' ⁿᵉʷ';
  }

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
      let tooltipContent = `$(${categoryIcon}) **${element.category.toUpperCase()}**`;
      if (element.description) {
        tooltipContent += `\n\n${element.description}`;
      }
      const tooltip = new vscode.MarkdownString(tooltipContent);
      tooltip.supportThemeIcons = true;
      item.tooltip = tooltip;
      
      // Color ICON
      item.iconPath = new vscode.ThemeIcon(categoryIcon, new vscode.ThemeColor('textLink.foreground'));
      
      return item;
    }

    // Use control name with NEW badge if applicable
    const itemLabel = element.isNew ? element.name + this.createNewBadge() : element.name;
    const item = new vscode.TreeItem(itemLabel);
    
    // Get category icon
    const categoryIcon = this.categoryIcons[element.category] || 'gear';
    
    // Enhanced tooltip with category icon, name, status and click instruction
    let tooltipContent = `$(${categoryIcon}) **${element.name}**`;
    if (element.isNew) {
      tooltipContent += ` $(star-full) **NEW**`;
    }
    tooltipContent += `\n\nCategory: ${element.category}`;
    if (element.description) {
      tooltipContent += `\n\n${element.description}`;
    }
    
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

/**
 * Get available editor controls for shortcut creator
 */
export function getAvailableEditorControls(): Array<{name: string, key: string, category: string}> {
  return EditorControlsProvider.controls
    .filter(control => control.configKey) // Only include controls with config keys
    .map(control => ({
      name: control.name,
      key: control.configKey!,
      category: control.category
    }));
}