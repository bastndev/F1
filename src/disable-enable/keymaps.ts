import * as vscode from 'vscode';

// Helper function for consistent notifications
function showToggleNotification(feature: string, isEnabled: boolean): void {
  const emoji = isEnabled ? '❌' : '✅';
  const status = isEnabled ? 'DISABLED ' : 'ENABLED';
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

        // Show notification
        showToggleNotification('Word Wrap', newMarkdownWrap === 'on');
      } catch (error) {
        vscode.window.showErrorMessage(`Error toggling word wrap: ${error}`);
      }
    }
  );

  //================================================================
  // Toggle AI Suggestions - Unified Notification (Shift+F1)
  //================================================================
  const toggleAISuggestions = vscode.commands.registerCommand(
    'f1.toggleAISuggestions',
    async () => {
      const aiToggleCommands = [
        'windsurf.prioritized.supercompleteEscape',       // 0: Windsurf
        'github.copilot.toggleInlineSuggestion',          // 1: GitHub Copilot (VSCode)
        'editor.cpp.disableAnnotated',                    // 2: Cursor AI
        'icube.toggleAISuggestions',                      // 3: Trae AI
        // ---- ---- ---- ---- --- -- -                   // 4: Firebase Studio
        // ---- ---- ---- ---- --- -- -                   // 5: Kiro
      ];

      const config = vscode.workspace.getConfiguration();
      let commandExecuted = false;

      try {
        // Try each AI command until one works
        for (const command of aiToggleCommands) {
          try {
            await vscode.commands.executeCommand(command);
            commandExecuted = true;
            break;
          } catch {
            continue; // Try next command
          }
        }

        // Fallback to general inline suggestions if no AI command worked
        if (!commandExecuted) {
          const currentInlineSuggest = config.get('editor.inlineSuggest.enabled', true) as boolean;
          const newInlineSuggest = !currentInlineSuggest;
          
          await config.update(
            'editor.inlineSuggest.enabled',
            newInlineSuggest,
            vscode.ConfigurationTarget.Global
          );
        }

        // Get current state for notification (always check the general setting)
        const currentState = config.get('editor.inlineSuggest.enabled', true) as boolean;
        showToggleNotification('💡 AI Suggestions', currentState);

      } catch (error) {
        vscode.window.showErrorMessage(`Error toggling AI suggestions: ${error}`);
      }
    }
  );

  // Register commands
  context.subscriptions.push(toggleMarkdownWrap, toggleAISuggestions);
}