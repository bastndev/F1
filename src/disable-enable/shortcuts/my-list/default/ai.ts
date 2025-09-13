import * as vscode from 'vscode';

// Notifications AI
function showAIToggleNotification(isEnabled: boolean): void {
  const emoji = isEnabled ? '✅' : '❌';
  const status = isEnabled ? 'ENABLED' : 'DISABLED';
  vscode.window.showInformationMessage(`💡 AI Suggestions ${status} ${emoji}`);
}

// Track Cursor AI state
let cursorAIEnabled = true;

async function getCurrentAISuggestionsState(): Promise<boolean> {
  const config = vscode.workspace.getConfiguration();

  // For Cursor,
  const availableCommands = await vscode.commands.getCommands();
  const isCursor =
    availableCommands.includes('editor.cpp.disableenabled') ||
    availableCommands.includes('editor.action.enableCppGlobally');

  if (isCursor) {
    return cursorAIEnabled;
  }

  const inlineSuggestEnabled = config.get(
    'editor.inlineSuggest.enabled',
    true
  ) as boolean;
  return inlineSuggestEnabled;
}

async function toggleAISuggestionsState(
  currentState: boolean
): Promise<boolean> {
  const config = vscode.workspace.getConfiguration();
  const newState = !currentState;

  // Others AI (suggestions)
  const aiToggleCommands = [
    'windsurf.prioritized.supercompleteEscape', // 0: Windsurf
    'github.copilot.toggleInlineSuggestion',    // 1: GitHub Copilot (VSCode)
    'trae.tab.enableSmartEdit',                 // 3: Trae AI
    // ---- --- --- -- -- -                     // 4: Firebase Studio   
    // ---- --- --- -- -- -                     // 5: Kiro   
  ];

  // 2: Cursor.ai (enable/disable)
  const cursorCommands = {
    disable: 'editor.cpp.disableenabled',
    enable: 'editor.action.enableCppGlobally',
  };

  let commandExecuted = false;

  // Try Cursor AI commands first (they have separate enable/disable)
  try {
    if (newState) {
      await vscode.commands.executeCommand(cursorCommands.enable);
      cursorAIEnabled = true;
    } else {
      await vscode.commands.executeCommand(cursorCommands.disable);
      cursorAIEnabled = false;
    }
    commandExecuted = true;
  } catch {
    // If Cursor commands fail, try other AI toggle commands
    for (const command of aiToggleCommands) {
      try {
        await vscode.commands.executeCommand(command);
        commandExecuted = true;
        break;
      } catch {
        continue;
      }
    }
  }

  // Fallback to manual configuration update
  if (!commandExecuted) {
    try {
      await config.update(
        'editor.inlineSuggest.enabled',
        newState,
        vscode.ConfigurationTarget.Global
      );
    } catch (error) {
      console.error('Error updating AI settings manually:', error);
      throw error;
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 100));

  return newState;
}

export function activate(context: vscode.ExtensionContext) {
  //================================================================
  // Toggle AI Suggestions - Improved Synchronization (Shift+F1)
  //================================================================
  const toggleAISuggestions = vscode.commands.registerCommand(
    'f1.toggleAISuggestions',
    async () => {
      try {
        const currentState = await getCurrentAISuggestionsState();

        const newState = await toggleAISuggestionsState(currentState);

        // Verify the actual final state after toggle
        await new Promise((resolve) => setTimeout(resolve, 200));
        const finalState = await getCurrentAISuggestionsState();

        showAIToggleNotification(finalState);

        console.log(`AI Suggestions: ${currentState} → ${finalState}`);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error toggling AI suggestions: ${error}`
        );
        console.error('AI toggle error:', error);
      }
    }
  );

  //================================================================
  // Optional: Command to check current AI state (for debugging)
  //================================================================
  const checkAIState = vscode.commands.registerCommand(
    'f1.checkAISuggestionsState',
    async () => {
      try {
        const currentState = await getCurrentAISuggestionsState();
        const config = vscode.workspace.getConfiguration();

        const details: { [key: string]: any } = {
          'Inline Suggest': config.get('editor.inlineSuggest.enabled', true),
          'Tab Completion': config.get('editor.tabCompletion', 'off'),
          'Overall State': currentState,
        };

        if (config.has('github.copilot.enable')) {
          details['Copilot (read-only)'] = config.get(
            'github.copilot.enable',
            'not set'
          );
        }

        vscode.window.showInformationMessage(
          `AI State: ${
            currentState ? 'ENABLED' : 'DISABLED'
          } | Details: ${JSON.stringify(details)}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error checking AI state: ${error}`);
      }
    }
  );

  // Register commands
  context.subscriptions.push(
    toggleAISuggestions,
    checkAIState // Optional debug command
  );
}
