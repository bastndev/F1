#!/usr/bin/env node

// Bun installs the dependencies; system Node runs CLI Hub's PTY host. Validate
// with that runtime, not with Bun's addon loader or Electron's embedded Node.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { promisify } = require('node:util');

const prefix = '[F1 native check]';
const execFileAsync = promisify(execFile);

function collectElfFiles(directory) {
	if (!fs.existsSync(directory)) {
		return [];
	}
	const files = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectElfFiles(file));
		} else if (entry.isFile()) {
			const descriptor = fs.openSync(file, 'r');
			try {
				const magic = Buffer.alloc(4);
				if (fs.readSync(descriptor, magic, 0, 4, 0) === 4 && magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
					files.push(file);
				}
			} finally {
				fs.closeSync(descriptor);
			}
		}
	}
	return files;
}

async function checkLinuxDependencies(nodePtyRoot, extensionRoot) {
	// Also inspect foreign Linux architectures included in universal packages.
	// Loading only the current platform's addon cannot verify those artifacts.
	const files = [
		...collectElfFiles(path.join(nodePtyRoot, 'build')),
		...collectElfFiles(path.join(nodePtyRoot, 'prebuilds'))
	];
	for (const file of files) {
		let stdout;
		try {
			({ stdout } = await execFileAsync('readelf', ['--dynamic', '--wide', file], {
				encoding: 'utf8',
				env: { ...process.env, LC_ALL: 'C' },
				timeout: 10000,
				windowsHide: true
			}));
		} catch (error) {
			if (error.code === 'ENOENT') {
				throw new Error('Linux artifacts need readelf for dependency verification. Install binutils on the build machine, then run this check again.');
			}
			throw new Error(`Cannot inspect ${path.relative(extensionRoot, file)}: ${error.message}`);
		}
		const libraries = [...stdout.matchAll(/\(NEEDED\)\s+Shared library: \[([^\]]+)\]/g)].map((match) => match[1]);
		const nodeLibraries = libraries.filter((library) => /(?:^|\/)libnode\.so(?:\.|$)/.test(library));
		if (nodeLibraries.length) {
			throw new Error(`${path.relative(extensionRoot, file)} depends on ${nodeLibraries.join(', ')}. This ties the release to the build machine's Node installation. Rebuild node-pty with an official standalone Node runtime, then verify again.`);
		}
	}
	console.log(`${prefix} Linux dependencies: ${files.length} ELF artifact(s) checked; no libnode.so dependency.`);
}

async function checkTerminal(nodePtyRoot, extensionRoot) {
	let nodePty;
	try {
		nodePty = require(nodePtyRoot);
	} catch (error) {
		throw new Error(`node-pty cannot load in Node ${process.version} (${process.platform}-${process.arch}): ${error.message}`);
	}
	const token = randomBytes(12).toString('hex');
	const ready = `F1_PTY_READY:${token}`;
	const expected = `F1_PTY_OK:tty:${token}`;
	const childScript = [
		`const token = ${JSON.stringify(token)}`,
		'let received = ""',
		'let answered = false',
		'process.stdin.setEncoding("utf8")',
		'process.stdin.on("data", (chunk) => { received += chunk; if (!answered && received.includes(token)) { answered = true; const kind = process.stdin.isTTY && process.stdout.isTTY ? "tty" : "pipe"; process.stdout.write("F1_PTY_OK:" + kind + ":" + token + "\\n", () => process.exit(0)); } })',
		`process.stdout.write(${JSON.stringify(ready + '\n')})`
	].join(';');

	await new Promise((resolve, reject) => {
		let terminal;
		let output = '';
		let sent = false;
		let settled = false;
		const finish = (error) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			if (error) {
				try {
					terminal?.kill();
				} catch {
					// A failed spawn or exited process may already be gone.
				}
				reject(error);
			} else {
				resolve();
			}
		};
		const timer = setTimeout(() => finish(new Error(`PTY input/output check timed out. Last output: ${JSON.stringify(output.slice(-2000))}`)), 10000);
		try {
			terminal = nodePty.spawn(process.execPath, ['-e', childScript], {
				name: 'xterm-256color',
				cols: 80,
				rows: 24,
				cwd: extensionRoot,
				env: Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string'))
			});
			terminal.onData((data) => {
				output = (output + data).slice(-64000);
				if (!sent && output.includes(ready)) {
					sent = true;
					try {
						terminal.resize(100, 30);
						terminal.write(`${token}\r`);
					} catch (error) {
						finish(error);
					}
				}
			});
			terminal.onExit(({ exitCode }) => {
				if (exitCode !== 0 || !output.includes(expected)) {
					finish(new Error(`PTY input/output check failed (exit ${exitCode}). Last output: ${JSON.stringify(output.slice(-2000))}`));
				} else {
					finish();
				}
			});
		} catch (error) {
			finish(error);
		}
	});
	console.log(`${prefix} Node ${process.version} (${process.platform}-${process.arch}): native load, terminal input/output, resize and clean exit passed.`);
}

async function main() {
	const args = process.argv.slice(2);
	if (args.length === 1 && args[0] === '--help') {
		console.log('Usage: node scripts/check-native.cjs [extension-root]\nThe optional root can point to an extracted VSIX extension/ directory.');
		return;
	}
	if (args.length > 1 || args[0]?.startsWith('-')) {
		throw new Error('Usage: node scripts/check-native.cjs [extension-root]');
	}
	if (process.versions.bun || process.versions.electron) {
		throw new Error('Run this check with system Node: node scripts/check-native.cjs [extension-root]. Bun/Electron is not the runtime used by CLI Hub.');
	}
	const extensionRoot = args[0] ? path.resolve(args[0]) : path.resolve(__dirname, '..');
	const nodePtyRoot = path.join(extensionRoot, 'node_modules', 'node-pty');
	if (!fs.existsSync(path.join(nodePtyRoot, 'package.json'))) {
		throw new Error(`node-pty is missing from ${extensionRoot}. Install the project's dependencies with bun before checking, or verify the extracted package contains its runtime dependencies.`);
	}
	await checkLinuxDependencies(nodePtyRoot, extensionRoot);
	await checkTerminal(nodePtyRoot, extensionRoot);
}

main().catch((error) => {
	console.error(`${prefix} FAILED: ${error.message}`);
	console.error(`${prefix} On Linux, repair the build from the extension root using system Node: npm rebuild node-pty --foreground-scripts. Preserve upstream prebuilds; do not set npm_config_build_from_source=true.`);
	process.exitCode = 1;
});
