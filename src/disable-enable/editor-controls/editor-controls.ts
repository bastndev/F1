import * as vscode from 'vscode';
import { NotificationManager } from './ed-notifications';

interface EditorControl {
  name: string;
  category: 'editor' | 'ui' | 'formatting' | 'features' | 'debugging';
  configKey?: string; // For future implementation
  isSeparator?: boolean; // For visual separation between categories
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
    {
      name: 'Minimap',
      category: 'editor',
      configKey: 'editor.minimap.enabled',
    },
    {
      name: 'Line Numbers',
      category: 'editor',
      configKey: 'editor.lineNumbers',
    },
    { name: 'Code Folding', category: 'editor', configKey: 'editor.folding' },
    {
      name: 'Sticky Scroll',
      category: 'editor',
      configKey: 'editor.stickyScroll.enabled',
    },
    {
      name: 'Indent Guides',
      category: 'editor',
      configKey: 'editor.guides.indentation',
    },
    {
      name: 'Bracket Pair Colorization',
      category: 'editor',
      configKey: 'editor.bracketPairColorization.enabled',
    },
    {
      name: 'Color Decorators',
      category: 'editor',
      configKey: 'editor.colorDecorators',
    },
    {
      name: 'Cursor Blinking',
      category: 'editor',
      configKey: 'editor.cursorBlinking',
    },
    {
      name: 'Cursor Smooth Caret Animation',
      category: 'editor',
      configKey: 'editor.cursorSmoothCaretAnimation',
    },

    // Separator
    { name: '', category: 'editor', isSeparator: true },

    // UI Features
    { name: 'Breadcrumbs', category: 'ui', configKey: 'breadcrumbs.enabled' },
    {
      name: 'Activity Bar',
      category: 'ui',
      configKey: 'workbench.activityBar.visible',
    },
    {
      name: 'Status Bar',
      category: 'ui',
      configKey: 'workbench.statusBar.visible',
    },
    {
      name: 'Side Bar',
      category: 'ui',
      configKey: 'workbench.sideBar.location',
    },
    {
      name: 'Panel',
      category: 'ui',
      configKey: 'workbench.panel.defaultLocation',
    },
    { name: 'Tabs', category: 'ui', configKey: 'workbench.editor.showTabs' },
    {
      name: 'Compact Folders',
      category: 'ui',
      configKey: 'explorer.compactFolders',
    },
    { name: 'Tree Indent', category: 'ui', configKey: 'workbench.tree.indent' },

    // Separator
    { name: '', category: 'ui', isSeparator: true },

    // Formatting & Code Features
    {
      name: 'Format On Save',
      category: 'formatting',
      configKey: 'editor.formatOnSave',
    },
    {
      name: 'Format On Type',
      category: 'formatting',
      configKey: 'editor.formatOnType',
    },
    {
      name: 'Format On Paste',
      category: 'formatting',
      configKey: 'editor.formatOnPaste',
    },
    { name: 'Auto Save', category: 'formatting', configKey: 'files.autoSave' },
    {
      name: 'Trim Trailing Whitespace',
      category: 'formatting',
      configKey: 'files.trimTrailingWhitespace',
    },
    {
      name: 'Insert Final Newline',
      category: 'formatting',
      configKey: 'files.insertFinalNewline',
    },

    // Separator
    { name: '', category: 'formatting', isSeparator: true },

    // IntelliSense & Features
    {
      name: 'IntelliSense',
      category: 'features',
      configKey: 'editor.quickSuggestions',
    },
    {
      name: 'Parameter Hints',
      category: 'features',
      configKey: 'editor.parameterHints.enabled',
    },
    { name: 'Hover', category: 'features', configKey: 'editor.hover.enabled' },
    { name: 'Code Lens', category: 'features', configKey: 'editor.codeLens' },
    {
      name: 'Auto Closing Brackets',
      category: 'features',
      configKey: 'editor.autoClosingBrackets',
    },
    {
      name: 'Auto Closing Quotes',
      category: 'features',
      configKey: 'editor.autoClosingQuotes',
    },
    {
      name: 'Auto Surround Selection',
      category: 'features',
      configKey: 'editor.autoSurround',
    },
    {
      name: 'Suggest On Trigger Characters',
      category: 'features',
      configKey: 'editor.suggestOnTriggerCharacters',
    },
    {
      name: 'Accept Suggestion On Enter',
      category: 'features',
      configKey: 'editor.acceptSuggestionOnEnter',
    },

    // Separator
    { name: '', category: 'features', isSeparator: true },

    // Debugging & Terminal
    {
      name: 'Debug Console',
      category: 'debugging',
      configKey: 'debug.console.fontSize',
    },
    {
      name: 'Inline Values',
      category: 'debugging',
      configKey: 'debug.inlineValues',
    },
    {
      name: 'Terminal Cursor Blinking',
      category: 'debugging',
      configKey: 'terminal.integrated.cursorBlinking',
    },
    {
      name: 'Git Decorations',
      category: 'features',
      configKey: 'git.decorations.enabled',
    },
    {
      name: 'Git Auto Fetch',
      category: 'features',
      configKey: 'git.autofetch',
    },
  ];

  getTreeItem(element: EditorControl): vscode.TreeItem {
    if (element.isSeparator) {
      const item = new vscode.TreeItem('');
      item.description = '.'.repeat(0); //Separator
      item.contextValue = 'separator';
      return item;
    }

    const item = new vscode.TreeItem(element.name);
    item.tooltip = `Category: ${element.category}`;

    // Make items clickable if they have a configKey
    if (element.configKey) {
      item.command = {
        command: 'f1-editor-controls.toggleControl',
        title: 'Toggle Control',
        arguments: [element.name],
      };
    }

    return item;
  }

  getChildren(): EditorControl[] {
    // Return without sorting alphabetically
    return this.controls;
  }

  // Methods for future implementation
  getControlsByCategory(category: string): EditorControl[] {
    return this.controls.filter((control) => control.category === category);
  }

  getControlByName(name: string): EditorControl | undefined {
    return this.controls.find((control) => control.name === name);
  }

  /**
   * Toggles a control's configuration value
   */
  async toggleControl(controlName: string): Promise<void> {
    const control = this.getControlByName(controlName);

    if (!control || !control.configKey) {
      NotificationManager.showErrorNotification(
        controlName,
        'Configuration key not found'
      );
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

      // Show notification
      const isEnabled = this.isValueEnabled(newValue);
      NotificationManager.showToggleNotification(controlName, isEnabled);

      // Refresh tree view
      this._onDidChangeTreeData.fire();
    } catch (error) {
      NotificationManager.showErrorNotification(
        controlName,
        error instanceof Error ? error.message : 'Unknown error'
      );
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
      if (enabledValues.includes(value)) {return true;}
      if (disabledValues.includes(value)) {return false;}
    }

    // Default: treat truthy values as enabled
    return !!value;
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

  context.subscriptions.push(toggleCommand);
}

export function deactivate() {}
