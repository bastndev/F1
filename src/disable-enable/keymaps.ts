import * as vscode from 'vscode';

// Helper function for consistent notifications
function showToggleNotification(feature: string, isEnabled: boolean): void {
  const emoji = isEnabled ? '✅' : '❌';
  const status = isEnabled ? 'ENABLED' : 'DISABLED';
  vscode.window.showInformationMessage(`${feature} ${status} ${emoji}`);
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

        // Show notification using helper function
        showToggleNotification('Word Wrap', newMarkdownWrap === 'off');
      } catch (error) {
        vscode.window.showErrorMessage(`Error toggling word wrap: ${error}`);
      }
    }
  );

  //================================================================
  // Toggle AI Suggestions - Clean & Simple (Shift+F1)
  //================================================================
  const toggleAISuggestions = vscode.commands.registerCommand(
    'f1.toggleAISuggestions',
    async () => {
      // AI TOGGLE COMMANDS MARK:[Shift+F1]
      const aiToggleCommands = [
        'windsurf.prioritized.supercompleteEscape',       // 0: Windsurf
        'github.copilot.toggleInlineSuggestion',          // 1: GitHub Copilot (VSCode)
        'editor.cpp.disableAnnotated',                    // 2: Cursor AI
        'icube.toggleAISuggestions',                      // 3: Trae AI
        // ---- ---- ---- ---- --- -- -                   // 4: Firebase Studio
        // ---- ---- ---- ---- --- -- -                   // 5: Kiro
      ];

      const config = vscode.workspace.getConfiguration();
      let toggleExecuted = false;

      try {
        // Try each AI command until one works
        for (let i = 0; i < aiToggleCommands.length; i++) {
          try {
            await vscode.commands.executeCommand(aiToggleCommands[i]);
            
            // Show appropriate notification based on which command worked
            switch (i) {
              case 0: // GitHub Copilot
                const copilotEnabled = config.get('github.copilot.inlineSuggest.enable', true);
                showToggleNotification('GitHub Copilot', !copilotEnabled);
                break;
              case 1: // Cursor AI
                // Cursor doesn't expose state, so we alternate the message
                showToggleNotification('Cursor AI', true); // Generic toggle message
                break;
            }
            
            toggleExecuted = true;
            break; // Exit loop once a command succeeds
          } catch (error) {
            // Command not available, try next one
            continue;
          }
        }

        // Fallback: If no specific AI commands work, use general inline suggestions
        if (!toggleExecuted) {
          const currentInlineSuggest = config.get('editor.inlineSuggest.enabled', true) as boolean;
          const newInlineSuggest = !currentInlineSuggest;
          
          await config.update(
            'editor.inlineSuggest.enabled',
            newInlineSuggest,
            vscode.ConfigurationTarget.Global
          );
          
          showToggleNotification('AI Suggestions', newInlineSuggest);
        }

      } catch (error) {
        vscode.window.showErrorMessage(`Error toggling AI suggestions: ${error}`);
      }
    }
  );

  // Register commands
  context.subscriptions.push(toggleMarkdownWrap, toggleAISuggestions);
}