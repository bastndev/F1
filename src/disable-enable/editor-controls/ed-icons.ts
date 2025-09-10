import * as vscode from 'vscode';

export class IconManager {
  /**
   * Gets the appropriate icon based on the control's enabled state
   * @param configKey - The VS Code configuration key
   * @returns ThemeIcon for enabled/disabled state
   */
  static getControlIcon(configKey: string): vscode.ThemeIcon {
    const config = vscode.workspace.getConfiguration();
    const currentValue = config.get(configKey);

    const isEnabled = IconManager.isValueEnabled(currentValue);

    return isEnabled
      ? new vscode.ThemeIcon(
          'circle-filled',
          new vscode.ThemeColor('charts.green')
        ) // Enabled state - green filled circle
      : new vscode.ThemeIcon('circle', new vscode.ThemeColor('charts.red')); // Disabled state - red empty circle
  }

  /**
   * Determines if a configuration value represents an "enabled" state
   * @param value - The configuration value to check
   * @returns boolean indicating if the value represents an enabled state
   */
  private static isValueEnabled(value: any): boolean {
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
   * Gets a text representation of the icon for display purposes
   * @param configKey - The VS Code configuration key
   * @returns String representation of the icon
   */
  static getControlIconText(configKey: string): string {
    const config = vscode.workspace.getConfiguration();
    const currentValue = config.get(configKey);
    const isEnabled = IconManager.isValueEnabled(currentValue);

    return isEnabled ? '●' : '○';
  }
}
