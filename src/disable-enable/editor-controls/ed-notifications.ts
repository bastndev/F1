import * as vscode from 'vscode';

export class NotificationManager {
  /**
   * Shows a notification when a control is toggled
   * @param controlName - Name of the control (e.g., "Minimap")
   * @param isEnabled - Current state after toggle
   */
  static showToggleNotification(controlName: string, isEnabled: boolean): void {
    const status = isEnabled ? 'ENABLED' : 'DISABLED';
    const message = `${controlName} ${status}`;
    
    if (isEnabled) {
      vscode.window.showInformationMessage(`✅ ${message}`);
    } else {
      vscode.window.showWarningMessage(`❌ ${message}`);
    }
  }

  /**
   * Shows an error notification when toggle fails
   * @param controlName - Name of the control
   * @param error - Error message
   */
  static showErrorNotification(controlName: string, error: string): void {
    vscode.window.showErrorMessage(`Failed to toggle ${controlName}: ${error}`);
  }

  /**
   * Shows info notification for special cases
   * @param message - Custom message to show
   */
  static showInfoNotification(message: string): void {
    vscode.window.showInformationMessage(message);
  }
}