import * as vscode from 'vscode';

// Helper function for AI notifications
function showAIToggleNotification(isEnabled: boolean): void {
  const emoji = isEnabled ? '✅' : '❌';
  const status = isEnabled ? 'ENABLED' : 'DISABLED';
  vscode.window.showInformationMessage(`💡 AI Suggestions ${status} ${emoji}`);
}

async function getCurrentAISuggestionsState(): Promise<boolean> {
  const config = vscode.workspace.getConfiguration();
  
  // We only check the state of inlineSuggest since it is universal
  const inlineSuggestEnabled = config.get('editor.inlineSuggest.enabled', true) as boolean;
  
  return inlineSuggestEnabled;
}

// Enhanced function to toggle AI suggestions
async function toggleAISuggestionsState(currentState: boolean): Promise<boolean> {
  const config = vscode.workspace.getConfiguration();
  const newState = !currentState;
  
  const aiToggleCommands = [
    'windsurf.prioritized.supercompleteEscape',       // 0: Windsurf
    'github.copilot.toggleInlineSuggestion',          // 1: GitHub Copilot (VSCode)
    'editor.cpp.disableenabled',                      // 2: Cursor AI
    'icube.toggleAISuggestions',                      // 3: Trae AI
    // ---- ---- --- --- -- -                         // 4: Firebase Studio
    // ---- ---- --- -- --                            // 5: Kiro
  ];

  let commandExecuted = false;
  
  // Try specific AI commands first
  for (const command of aiToggleCommands) {
    try {
      await vscode.commands.executeCommand(command);
      commandExecuted = true;
      break;
    } catch {
      continue; // Try next command
    }
  }
  
  if (!commandExecuted) {
    try {
      await config.update(
        'editor.inlineSuggest.enabled',
        newState,
        vscode.ConfigurationTarget.Global
      );
      
      // Helper function for AI notifications 
    } catch (error) {
      console.error('Error updating AI settings manually:', error);
      throw error;
    }
  }
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
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
        // First, detect current state accurately
        const currentState = await getCurrentAISuggestionsState();
        
        // Toggle the state
        const newState = await toggleAISuggestionsState(currentState);
        
        // Verify the actual final state after toggle
        // Wait a bit more for all settings to propagate
        await new Promise(resolve => setTimeout(resolve, 200));
        const finalState = await getCurrentAISuggestionsState();
        
        // Show notification with the actual final state
        showAIToggleNotification(finalState);
        
        // Debug logging (remove in production)
        console.log(`AI Suggestions: ${currentState} → ${finalState}`);
        
      } catch (error) {
        vscode.window.showErrorMessage(`Error toggling AI suggestions: ${error}`);
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
          'Overall State': currentState
        };
        
        if (config.has('github.copilot.enable')) {
          details['Copilot (read-only)'] = config.get('github.copilot.enable', 'not set');
        }
        
        vscode.window.showInformationMessage(
          `AI State: ${currentState ? 'ENABLED' : 'DISABLED'} | Details: ${JSON.stringify(details)}`
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