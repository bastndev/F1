import * as vscode from 'vscode';

// Helper function for consistent notifications
function showToggleNotification(feature: string, isEnabled: boolean): void {
  const emoji = isEnabled ? '✅' : '❌';
  const status = isEnabled ? 'ENABLED' : 'DISABLED';
  vscode.window.showInformationMessage(`${feature} ${status} ${emoji}`);
}

async function getCurrentAISuggestionsState(): Promise<boolean> {
  const config = vscode.workspace.getConfiguration();
  
  const inlineSuggestEnabled = config.get('editor.inlineSuggest.enabled', true) as boolean;
  const copilotEnabled = config.get('github.copilot.enable', true) as boolean;
  const tabCompletionEnabled = config.get('editor.tabCompletion', 'off') !== 'off';
  
  return inlineSuggestEnabled || copilotEnabled || tabCompletionEnabled;
}

// Enhanced function to toggle AI suggestions
async function toggleAISuggestionsState(currentState: boolean): Promise<boolean> {
  const config = vscode.workspace.getConfiguration();
  const newState = !currentState;
  
  const aiToggleCommands = [
    'windsurf.prioritized.supercompleteEscape',       // 0: Windsurf
    'github.copilot.toggleInlineSuggestion',          // 1: GitHub Copilot (VSCode)
    'editor.action.enableCppGlobally',                // 2: Cursor AI
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
  
  // If no specific AI command worked, handle general settings manually
  if (!commandExecuted) {
    try {
      await config.update(
        'editor.inlineSuggest.enabled',
        newState,
        vscode.ConfigurationTarget.Global
      );
      
      // Also try to toggle Copilot if present
      const hasCopilot = config.has('github.copilot.enable');
      if (hasCopilot) {
        await config.update(
          'github.copilot.enable',
          newState,
          vscode.ConfigurationTarget.Global
        );
      }
      
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
  // Toggle Word Wrap for All Files (F1) - Synchronized with Markdown
  //================================================================
  const toggleMarkdownWrap = vscode.commands.registerCommand(
    'f1.toggleMarkdownWrap',
    async () => {
      const config = vscode.workspace.getConfiguration();
      
      // Get current markdown word wrap state first (this will be our reference)
      const currentSetting = config.get('[markdown]') as any;
      const currentMarkdownWrap = currentSetting?.['editor.wordWrap'] || 'off';
      const newMarkdownWrap = currentMarkdownWrap === 'off' ? 'on' : 'off';
      
      try {
        // Synchronize general word wrap with markdown state
        await config.update(
          'editor.wordWrap',
          newMarkdownWrap,
          vscode.ConfigurationTarget.Global
        );

        // Update markdown specific word wrap
        await config.update(
          '[markdown]',
          {
            'editor.formatOnSave': false,
            'editor.defaultFormatter': null,
            'editor.wordWrap': newMarkdownWrap,
          },
          vscode.ConfigurationTarget.Global
        );

        // Show notification
        showToggleNotification('📝 Word Wrap', newMarkdownWrap === 'off');
      } catch (error) {
        vscode.window.showErrorMessage(`Error toggling word wrap: ${error}`);
      }
    }
  );

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
        showToggleNotification('💡 AI Suggestions', finalState);
        
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
        
        const details = {
          'Inline Suggest': config.get('editor.inlineSuggest.enabled', true),
          'Copilot': config.get('github.copilot.enable', 'not set'),
          'Tab Completion': config.get('editor.tabCompletion', 'off'),
          'Overall State': currentState
        };
        
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
    toggleMarkdownWrap, 
    toggleAISuggestions,
    checkAIState // Optional debug command
  );
}