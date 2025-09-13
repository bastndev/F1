import * as vscode from 'vscode';
import { F1WebviewProvider } from './disable-enable/shortcuts/ui';
import { MyListUI } from './disable-enable/shortcuts/my-list/user-shortcuts';
import { DynamicShortcutManager } from './disable-enable/shortcuts/my-list/dynamic';
import { activate as activateEditorControls } from './disable-enable/editor-controls/ed-controls';
import { activate as activateExtensions } from './disable-enable/extensions/editor-extensions';
import { activate as activateAI } from './disable-enable/shortcuts/my-list/default/ai';
import { activate as activateF1 } from './disable-enable/shortcuts/my-list/default/f1';

let dynamicShortcutManager: DynamicShortcutManager;

async function toggleConfiguration(configKey: string): Promise<void> {
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
    const readableName = getReadableConfigName(configKey);
    console.log(`${readableName}: ${formatConfigValue(newValue)}`);

  } catch (error) {
    console.warn(`Failed to toggle ${configKey}:`, error);
  }
}

function getReadableConfigName(configKey: string): string {
  const nameMap: Record<string, string> = {
    'editor.minimap.enabled': 'Minimap',
    'editor.folding': 'Code Folding',
    'editor.lineNumbers': 'Line Numbers',
    'editor.cursorBlinking': 'Cursor Blinking',
    'editor.colorDecorators': 'Color Decorators',
    'editor.renderIndentGuides': 'Indent Guides',
    'editor.stickyScroll.enabled': 'Sticky Scroll'
  };
  return nameMap[configKey] || configKey;
}

function formatConfigValue(value: any): string {
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

export async function activate(context: vscode.ExtensionContext) {
  // Initialize the shortcut list
  MyListUI.initialize(context);
  
  // Initialize the dynamic shortcut manager
  dynamicShortcutManager = DynamicShortcutManager.getInstance(context);
  await dynamicShortcutManager.initialize();
  
  // Register the webview provider for shortcuts
  const webviewProvider = new F1WebviewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      F1WebviewProvider.viewType,
      webviewProvider
    )
  );

  // Register command to execute shortcuts by ID
  context.subscriptions.push(
    vscode.commands.registerCommand('f1.executeShortcut', async (shortcutId: string) => {
      const shortcut = MyListUI.getShortcutById(shortcutId);
      if (!shortcut) {
        console.warn(`Shortcut with ID ${shortcutId} not found`);
        return;
      }

      try {
        MyListUI.markAsUsed(shortcut.id!);

        let actionsExecuted = 0;

        // Execute editor controls
        if (shortcut.actions.editorControls?.length) {
          for (const configKey of shortcut.actions.editorControls) {
            await toggleConfiguration(configKey);
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

        if (actionsExecuted > 0) {
          console.log(`✅ Executed "${shortcut.label}" (${actionsExecuted} actions)`);
        }

      } catch (error) {
        console.error('Error executing shortcut:', error);
        vscode.window.showErrorMessage(`Error executing shortcut: ${error}`);
      }
    })
  );

  // Register command to execute dynamic shortcuts by key combination
  context.subscriptions.push(
    vscode.commands.registerCommand('f1.executeDynamicShortcut', async (keyCombo: string) => {
      // Find shortcut by key combination
      const userShortcuts = MyListUI.getUserShortcuts();
      const shortcut = userShortcuts.find(s => s.key.toLowerCase() === keyCombo.toLowerCase());
      
      if (!shortcut) {
        // No shortcut assigned to this key combination
        return;
      }

      try {
        MyListUI.markAsUsed(shortcut.id!);

        let actionsExecuted = 0;

        // Execute editor controls
        if (shortcut.actions.editorControls?.length) {
          for (const configKey of shortcut.actions.editorControls) {
            if (configKey.startsWith('workbench.') || configKey.startsWith('editor.action.')) {
              // Execute as command
              await vscode.commands.executeCommand(configKey);
            } else {
              // Execute as configuration toggle
              await toggleConfiguration(configKey);
            }
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

        if (actionsExecuted > 0) {
          vscode.window.showInformationMessage(`✅ ${shortcut.label}`, {modal: false});
        }

      } catch (error) {
        console.error('Error executing dynamic shortcut:', error);
        vscode.window.showErrorMessage(`Error executing shortcut: ${error}`);
      }
    })
  );

  // Register commands for managing dynamic shortcuts
  context.subscriptions.push(
    vscode.commands.registerCommand('f1.addDynamicShortcut', async () => {
      vscode.window.showInformationMessage(
        'To create a shortcut, use the F1 panel in the sidebar → "Create Shortcut" button',
        'Open F1 Panel'
      ).then(action => {
        if (action === 'Open F1 Panel') {
          vscode.commands.executeCommand('workbench.view.extension.f1-functions');
        }
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('f1.removeDynamicShortcut', async () => {
      const shortcuts = MyListUI.getUserShortcuts();
      
      if (shortcuts.length === 0) {
        vscode.window.showInformationMessage('No shortcuts created yet');
        return;
      }
      
      const shortcutItems = shortcuts.map((s, index) => ({
        label: `${s.label} (${s.key})`,
        description: s.description || 'No description',
        index: index
      }));
      
      const selected = await vscode.window.showQuickPick(shortcutItems, {
        placeHolder: 'Select shortcut to remove'
      });
      
      if (selected) {
        await MyListUI.confirmAndDeleteShortcut(selected.index, shortcuts[selected.index].label);
        webviewProvider.refresh();
      }
    })
  );

  // Activate other data providers
  activateEditorControls(context);
  activateExtensions(context);
  activateAI(context);
  activateF1(context);
}

export function deactivate() {
  if (dynamicShortcutManager) {
    dynamicShortcutManager.dispose();
  }
}
