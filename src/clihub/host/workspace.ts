/**
 * Workspace queries the prompt modal needs: the @-mention file list and the
 * skills installed under .agents/skills / .claude/skills. Both answer an
 * id-tagged request from the webview (see shared/protocol.ts).
 */
import * as path from 'path';
import * as vscode from 'vscode';
import type { SkillRoot, WorkspaceSkill } from '../shared/prompt';
import type { InboundWebviewMessage } from '../shared/protocol';

export const handleWorkspaceListSkills = async (webview: vscode.Webview, message: InboundWebviewMessage) => {
	if (typeof message.id !== 'string') {
		return;
	}

	// A skill is a directory under one of these roots containing a SKILL.md.
	// Duplicated names collapse into one entry that remembers every root it
	// lives in, so the webview can resolve the right copy per active CLI.
	const skillRoots: Array<{ id: SkillRoot; rel: string }> = [
		{ id: 'agents', rel: '.agents/skills' },
		{ id: 'claude', rel: '.claude/skills' },
	];
	const rootsByName = new Map<string, SkillRoot[]>();
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

	if (workspaceFolder) {
		for (const root of skillRoots) {
			const rootUri = vscode.Uri.joinPath(workspaceFolder.uri, ...root.rel.split('/'));
			let entries: Array<[string, vscode.FileType]>;
			try {
				entries = await vscode.workspace.fs.readDirectory(rootUri);
			} catch {
				continue; // root doesn't exist — normal
			}

			const checks = entries
				.filter(([name, type]) => type === vscode.FileType.Directory && !name.startsWith('.'))
				.map(async ([name]) => {
					try {
						const manifest = vscode.Uri.joinPath(rootUri, name, 'SKILL.md');
						const stat = await vscode.workspace.fs.stat(manifest);
						return stat.type === vscode.FileType.File ? name : undefined;
					} catch {
						return undefined;
					}
				});

			for (const name of await Promise.all(checks)) {
				if (name) {
					rootsByName.set(name, [...(rootsByName.get(name) ?? []), root.id]);
				}
			}
		}
	}

	const skills: WorkspaceSkill[] = [...rootsByName.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, roots]) => ({ name, roots }));

	await webview.postMessage({
		type: 'workspace.skills',
		id: message.id,
		skills,
	});
};

export const handleWorkspaceListFiles = async (webview: vscode.Webview, message: InboundWebviewMessage) => {
	if (typeof message.id !== 'string') {
		return;
	}

	try {
		// Find files excluding common ignored directories
		const uris = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**}', 1000);
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

		const files = uris.map(uri => {
			const isDirectory = false; // findFiles only returns files
			const name = path.basename(uri.fsPath);
			// Get relative path if within workspace, else use full fsPath
			let relativePath = uri.fsPath;
			if (workspaceFolder && uri.fsPath.startsWith(workspaceFolder.uri.fsPath)) {
				relativePath = uri.fsPath.substring(workspaceFolder.uri.fsPath.length + 1);
				// Replace backslashes with forward slashes for consistency
				relativePath = relativePath.replace(/\\/g, '/');
			}

			return {
				name,
				path: relativePath,
				isDirectory
			};
		}).filter(entry => isMentionVisiblePath(entry.path));

		// If we also want directories, we could get unique directory paths from the files list
		const dirs = new Set<string>();
		files.forEach(f => {
			const dirPath = path.dirname(f.path);
			if (dirPath !== '.') {
				// Add all parent directories
				let current = dirPath;
				while (current !== '.' && current !== '') {
					dirs.add(current);
					current = path.dirname(current);
				}
			}
		});

		const allEntries = [...files];
		dirs.forEach(dir => {
			allEntries.push({
				name: path.basename(dir),
				path: dir,
				isDirectory: true
			});
		});

		await webview.postMessage({
			type: 'workspace.files',
			id: message.id,
			files: allEntries
		});
	} catch (error) {
		console.error('Error listing workspace files:', error);
		await webview.postMessage({
			type: 'workspace.files',
			id: message.id,
			files: [] // Return empty on error
		});
	}
};

function isMentionVisiblePath(relativePath: string): boolean {
	const segments = relativePath.split('/').filter(Boolean);
	return segments.every(segment => !segment.startsWith('.') || segment === '.vscode');
}
