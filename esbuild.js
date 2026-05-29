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

const copyCliHubAssets = () => {
	const outDir = path.join('dist', 'clihub');

	fs.mkdirSync(outDir, { recursive: true });
	fs.copyFileSync(path.join('src', 'clihub', 'index.html'), path.join(outDir, 'index.html'));
	fs.copyFileSync(path.join('src', 'clihub', 'global.css'), path.join(outDir, 'global.css'));
	copyDirectoryAssets(path.join('src', 'clihub', 'assets'), path.join(outDir, 'assets'));
	copyDirectoryAssets(path.join('src', 'clihub', 'webview'), path.join(outDir, 'webview'));
	copyXtermAssets(outDir);
};

const watchCliHubAssets = () => {
	const assetRoot = path.join('src', 'clihub');
	let copyTimer;

	const scheduleCopy = () => {
		clearTimeout(copyTimer);
		copyTimer = setTimeout(copyCliHubAssets, 50);
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

const cliHubAssetsPlugin = {
	name: 'clihub-assets',

	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length === 0) {
				copyCliHubAssets();
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
		external: ['vscode', 'node-pty'],
		logLevel: 'silent',
		plugins: [
			cliHubAssetsPlugin,
			esbuildProblemMatcherPlugin,
		],
	});
	const webviewCtx = await esbuild.context({
		entryPoints: [
			'src/clihub/webview/ui/panel-terminal/terminal.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/clihub/webview/webview.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	const launcherCtx = await esbuild.context({
		entryPoints: [
			'src/clihub/index.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/clihub/index.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	const ptyHostCtx = await esbuild.context({
		entryPoints: [
			'src/clihub/webview/core/terminal-cli/pty-host.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/clihub/webview/core/terminal-cli/pty-host.js',
		external: ['node-pty'],
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});

	if (watch) {
		await extensionCtx.watch();
		await webviewCtx.watch();
		await launcherCtx.watch();
		await ptyHostCtx.watch();
		watchCliHubAssets();
	} else {
		await extensionCtx.rebuild();
		await webviewCtx.rebuild();
		await launcherCtx.rebuild();
		await ptyHostCtx.rebuild();
		await extensionCtx.dispose();
		await webviewCtx.dispose();
		await launcherCtx.dispose();
		await ptyHostCtx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
