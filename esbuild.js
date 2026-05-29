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

const copyCliHubAssets = () => {
	const outDir = path.join('dist', 'clihub');

	fs.rmSync(outDir, { recursive: true, force: true });
	fs.mkdirSync(outDir, { recursive: true });
	fs.copyFileSync(path.join('src', 'clihub', 'index.html'), path.join(outDir, 'index.html'));
	fs.copyFileSync(path.join('src', 'clihub', 'global.css'), path.join(outDir, 'global.css'));
	copyDirectoryAssets(path.join('src', 'clihub', 'webview'), path.join(outDir, 'webview'));
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
	const ctx = await esbuild.context({
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
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			cliHubAssetsPlugin,
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
