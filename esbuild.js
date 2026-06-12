const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const copyDirectoryAssets = (from, to) => {
	fs.mkdirSync(to, { recursive: true });

	for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
		const sourcePath = path.join(from, entry.name);
		const targetPath = path.join(to, entry.name);

		if (entry.isDirectory()) {
			copyDirectoryAssets(sourcePath, targetPath);
			continue;
		}

		if (path.extname(entry.name) === '.ts') {
			continue;
		}

		fs.copyFileSync(sourcePath, targetPath);
	}
};

const copyXtermAssets = (outDir) => {
	const xtermCssPath = require.resolve("@xterm/xterm/css/xterm.css");
	const vendorDir = path.join(outDir, "vendor", "xterm");

	fs.mkdirSync(vendorDir, { recursive: true });
	fs.copyFileSync(xtermCssPath, path.join(vendorDir, "xterm.css"));
};

const collectDirectories = (rootDir) => {
	const directories = [rootDir];

	for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			directories.push(...collectDirectories(path.join(rootDir, entry.name)));
		}
	}

	return directories;
};

const copyWebviewAssets = () => {
	const outDir = path.join('dist', 'clihub', 'webview');

	// Every non-TS file under src/clihub/webview keeps its relative path in
	// dist/clihub/webview (HTML, CSS, SVG icons). xterm.css ships under vendor/.
	copyDirectoryAssets(path.join('src', 'clihub', 'webview'), outDir);
	copyXtermAssets(outDir);
};

const watchWebviewAssets = () => {
	const assetRoot = path.join('src', 'clihub', 'webview');
	let copyTimer;

	const scheduleCopy = () => {
		clearTimeout(copyTimer);
		copyTimer = setTimeout(copyWebviewAssets, 50);
	};

	for (const directory of collectDirectories(assetRoot)) {
		fs.watch(directory, (eventType, fileName) => {
			if (!fileName) {
				scheduleCopy();
				return;
			}

			const extension = path.extname(fileName.toString());
			if (extension === '.html' || extension === '.css' || extension === '.svg') {
				scheduleCopy();
			}
		});
	}
};

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

const webviewAssetsPlugin = {
	name: 'webview-assets',

	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length === 0) {
				copyWebviewAssets();
			}
		});
	},
};

async function main() {
	const extensionCtx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode', 'node-pty', 'cspell-trie-lib', '@cspell/dict-es-es'],
		logLevel: 'silent',
		plugins: [
			webviewAssetsPlugin,
			esbuildProblemMatcherPlugin,
		],
	});
	const terminalCtx = await esbuild.context({
		entryPoints: [
			'src/clihub/webview/panel-terminal/terminal.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/clihub/webview/terminal.js',
		loader: {
			'.css': 'text',
			'.html': 'text',
		},
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	const launcherCtx = await esbuild.context({
		entryPoints: [
			'src/clihub/webview/launcher/index.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/clihub/webview/launcher/index.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	const ptyHostCtx = await esbuild.context({
		entryPoints: [
			'src/clihub/host/terminal-cli/pty-host.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/clihub/host/pty-host.js',
		external: ['node-pty'],
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});

	if (watch) {
		await extensionCtx.watch();
		await terminalCtx.watch();
		await launcherCtx.watch();
		await ptyHostCtx.watch();
		watchWebviewAssets();
	} else {
		await extensionCtx.rebuild();
		await terminalCtx.rebuild();
		await launcherCtx.rebuild();
		await ptyHostCtx.rebuild();
		await extensionCtx.dispose();
		await terminalCtx.dispose();
		await launcherCtx.dispose();
		await ptyHostCtx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
