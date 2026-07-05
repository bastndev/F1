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

// The finish-sound WAVs live under src/my-cli/shared, which .vscodeignore drops
// from the package (it only keeps src/shared + src/my-skills assets). The host
// reads them at runtime via __dirname (= dist/), so copy them into dist where
// they actually ship. See core/voice/finish-sound.ts.
const copyVoiceAssets = () => {
	copyDirectoryAssets(
		path.join('src', 'my-cli', 'shared', 'voice', 'wav'),
		path.join('dist', 'my-cli', 'shared', 'voice', 'wav')
	);
};

const copyWebviewAssets = () => {
	const outDir = path.join('dist', 'my-cli', 'webview');

	// Every non-TS file under src/my-cli/webview keeps its relative path in
	// dist/my-cli/webview (HTML, CSS, SVG icons). xterm.css ships under vendor/.
	copyDirectoryAssets(path.join('src', 'my-cli', 'webview'), outDir);
	copyXtermAssets(outDir);
	copyVoiceAssets();
};

const watchWebviewAssets = () => {
	const assetRoot = path.join('src', 'my-cli', 'webview');
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
		external: ['vscode', 'node-pty', 'fixnow'],
		logLevel: 'silent',
		plugins: [
			webviewAssetsPlugin,
			esbuildProblemMatcherPlugin,
		],
	});
	const terminalCtx = await esbuild.context({
		entryPoints: [
			'src/my-cli/webview/panel-terminal/terminal.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/my-cli/webview/terminal.js',
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
			'src/my-cli/webview/launcher/index.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/my-cli/webview/launcher/index.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	const mySkillsWebviewCtx = await esbuild.context({
		entryPoints: [
			'src/my-skills/view/index.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/webview.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	const mySkillsCreateSkillCtx = await esbuild.context({
		entryPoints: [
			'src/my-skills/screens/create-skill/ui/index.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/create-skill.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	const mySkillsCreateSkillSupportCtx = await esbuild.context({
		entryPoints: [
			'src/shared/tutorial/t-skill/support.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/create-skill-support.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	const mySkillsSkillReadmeCtx = await esbuild.context({
		entryPoints: [
			'src/my-skills/screens/install-skill/ui/panels/trending-skill/flame/view-readme/readme.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/skill-readme.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	const cliTutorialCtx = await esbuild.context({
		entryPoints: [
			'src/shared/tutorial/t-cli/support.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/cli-tutorial.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	const ptyHostCtx = await esbuild.context({
		entryPoints: [
			'src/my-cli/core/terminal-cli/pty-host.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/my-cli/core/pty-host.js',
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
		await mySkillsWebviewCtx.watch();
		await mySkillsCreateSkillCtx.watch();
		await mySkillsCreateSkillSupportCtx.watch();
		await mySkillsSkillReadmeCtx.watch();
		await cliTutorialCtx.watch();
		await ptyHostCtx.watch();
		watchWebviewAssets();
	} else {
		await extensionCtx.rebuild();
		await terminalCtx.rebuild();
		await launcherCtx.rebuild();
		await mySkillsWebviewCtx.rebuild();
		await mySkillsCreateSkillCtx.rebuild();
		await mySkillsCreateSkillSupportCtx.rebuild();
		await mySkillsSkillReadmeCtx.rebuild();
		await cliTutorialCtx.rebuild();
		await ptyHostCtx.rebuild();
		await extensionCtx.dispose();
		await terminalCtx.dispose();
		await launcherCtx.dispose();
		await mySkillsWebviewCtx.dispose();
		await mySkillsCreateSkillCtx.dispose();
		await mySkillsCreateSkillSupportCtx.dispose();
		await mySkillsSkillReadmeCtx.dispose();
		await cliTutorialCtx.dispose();
		await ptyHostCtx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
