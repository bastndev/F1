import * as vscode from 'vscode';

const SKIP_DIRS = new Set([
	'node_modules',
	'.git',
	'.next',
	'.nuxt',
	'.svelte-kit',
	'dist',
	'build',
	'out',
	'coverage',
	'.cache',
	'.turbo',
	'vendor',
	'bin',
	'obj',
]);

export async function findSourceExtensions(
	workspaceUri: vscode.Uri,
	extensions: readonly string[],
	maxDepth = 4,
	maxEntries = 1400,
): Promise<Set<string>> {
	const wanted = new Set(extensions.map(extension => extension.toLowerCase()));
	const found = new Set<string>();
	let scanned = 0;

	async function scan(uri: vscode.Uri, depth: number): Promise<void> {
		if (depth > maxDepth || scanned >= maxEntries || found.size === wanted.size) {
			return;
		}

		let entries: [string, vscode.FileType][];
		try {
			entries = await vscode.workspace.fs.readDirectory(uri);
		} catch {
			return;
		}

		const subdirs: vscode.Uri[] = [];
		for (const [name, type] of entries) {
			if (scanned >= maxEntries || found.size === wanted.size) {
				return;
			}

			scanned += 1;

			if (type === vscode.FileType.Directory) {
				if (name.startsWith('.') || SKIP_DIRS.has(name)) {
					continue;
				}
				subdirs.push(vscode.Uri.joinPath(uri, name));
				continue;
			}

			if (type !== vscode.FileType.File) {
				continue;
			}

			const lowerName = name.toLowerCase();
			for (const extension of wanted) {
				if (lowerName.endsWith(extension)) {
					found.add(extension);
				}
			}
		}

		if (subdirs.length > 0) {
			await Promise.all(subdirs.map(subdir => scan(subdir, depth + 1)));
		}
	}

	await scan(workspaceUri, 0);
	return found;
}
