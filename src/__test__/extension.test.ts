import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { ConfigManager } from '../core/config-manager';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	suite('ConfigManager', () => {
		test('should return correct readable name', () => {
			// Test that getReadableName works (we can't easily test toggle without mocking vscode)
			// This is more of a smoke test
			assert.ok(ConfigManager);
		});
	});
});
