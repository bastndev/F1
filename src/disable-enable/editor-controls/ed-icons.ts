import * as vscode from 'vscode';

export class IconManager {
  // Simple color palette using VS Code theme colors
  private static readonly COLORS = {
    enabled: 'notificationsInfoIcon.foreground',
    disabled: 'notificationsErrorIcon.foreground',
    transitioning: 'notificationsWarningIcon.foreground'
  };

  // Simple icon styles
  private static readonly ICON_STYLES = {
    enabled: 'circle-filled',
    disabled: 'circle-outline',
    transitioning: 'sync~spin'
  };

  /**
   * Gets the appropriate icon based on the control's enabled state
   */
  static getControlIcon(configKey: string, isTransitioning = false): vscode.ThemeIcon {
    if (isTransitioning) {
      return new vscode.ThemeIcon(
        this.ICON_STYLES.transitioning,
        new vscode.ThemeColor(this.COLORS.transitioning)
      );
    }

    const config = vscode.workspace.getConfiguration();
    const currentValue = config.get(configKey);
    const isEnabled = this.isValueEnabled(currentValue);

    const color = isEnabled ? this.COLORS.enabled : this.COLORS.disabled;
    const iconName = isEnabled ? this.ICON_STYLES.enabled : this.ICON_STYLES.disabled;

    return new vscode.ThemeIcon(iconName, new vscode.ThemeColor(color));
  }

  /**
   * Gets a text representation of the icon
   */
  static getControlIconText(configKey: string, isTransitioning = false): string {
    if (isTransitioning) {
      return '⟳';
    }

    const config = vscode.workspace.getConfiguration();
    const currentValue = config.get(configKey);
    const isEnabled = this.isValueEnabled(currentValue);

    return isEnabled ? '●' : '○';
  }

  /**
   * Determines if a configuration value represents an "enabled" state
   */
  static isValueEnabled(value: any): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    const enabledValues = ['on', 'afterDelay', 'onFocusChange', 'onWindowChange', 'blink', 'smart'];
    const disabledValues = ['off', 'solid'];

    if (typeof value === 'string') {
      if (enabledValues.includes(value)) {
        return true;
      }
      if (disabledValues.includes(value)) {
        return false;
      }
    }

    return !!value;
  }
}
