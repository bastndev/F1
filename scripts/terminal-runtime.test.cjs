const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(process.env.F1_TEST_ROOT || path.join(__dirname, '..'));
const projectRequire = createRequire(path.join(root, 'package.json'));
let managerCode;
let loaderCode;
before(async () => {
	const bundle = async (entry) => (await projectRequire('esbuild').build({
		entryPoints: [path.join(root, 'src/my-cli/core/terminal-cli', entry)],
		bundle: true, write: false, format: 'cjs', platform: 'node',
		external: ['vscode', 'child_process', 'node-pty']
	})).outputFiles[0].text;
	[managerCode, loaderCode] = await Promise.all([bundle('session-manager.ts'), bundle('native-pty.ts')]);
});

function evaluate(code, overrides = {}) {
	const module = { exports: {} };
	vm.runInNewContext(code, {
		module, exports: module.exports, require: projectRequire, process, Buffer,
		Error, console, setTimeout, clearTimeout, setInterval, clearInterval,
		__dirname: path.join(root, 'dist'), ...overrides
	});
	return module.exports;
}

function harness() {
	const host = Object.assign(new EventEmitter(), {
		connected: true, killed: false, exitCode: null, signalCode: null,
		stdout: new EventEmitter(), stderr: new EventEmitter(), sent: [], kills: 0,
		send(command, callback) {
			this.sent.push(command);
			if (this.sendFailure === 'throw') { throw new Error('synchronous IPC failure'); }
			callback(this.sendFailure === 'callback' ? new Error('asynchronous IPC failure') : null);
		},
		kill() { this.killed = true; this.kills++; return true; }
	});
	const messages = [];
	const timers = new Map();
	const schedule = (callback, delay) => { const handle = {}; timers.set(handle, { callback, delay }); return handle; };
	const vscode = { workspace: { workspaceFolders: [{ uri: { fsPath: root } }] }, l10n: { t: (text) => text } };
	const { CliSessionManager } = evaluate(managerCode, {
		require: (name) => name === 'vscode' ? vscode : name === 'child_process' ? { spawn: () => host } : projectRequire(name),
		setTimeout: schedule, clearTimeout: (handle) => timers.delete(handle),
		setInterval: schedule, clearInterval: (handle) => timers.delete(handle)
	});
	const manager = new CliSessionManager();
	manager.attach({ postMessage: (message) => messages.push(message) });
	manager.createCustomSession({ label: 'probe', command: 'probe', args: [] });
	const state = () => messages.filter((message) => message.type === 'cli.state').at(-1);
	const sessionId = state().sessions[0].id;
	const send = (type, extra = {}) => manager.handleMessage({ type, sessionId, ...extra });
	const output = () => messages.filter((message) => message.type === 'cli.output').map((message) => message.data).join('');
	return { host, manager, messages, timers, state, sessionId, send, output };
}

test('native failure produces one error and stops subsequent IPC operations', () => {
	const h = harness();
	h.host.emit('message', { type: 'error', message: 'native module requires libnode.so.109' });
	assert.equal(h.state().sessions[0].status, 'error');
	assert.match(h.output(), /libnode\.so\.109/);
	const sent = h.host.sent.length;
	const outputs = h.messages.filter((message) => message.type === 'cli.output').length;
	h.host.connected = false;
	h.host.emit('error', new Error('Channel closed'));
	h.host.emit('disconnect');
	h.host.emit('exit', 1, null);
	h.host.emit('message', { type: 'ready' });
	h.send('cli.resize', { cols: 120, rows: 40 });
	h.send('cli.input', { data: 'hello\r' });
	assert.equal(h.host.sent.length, sent);
	assert.equal(h.messages.filter((message) => message.type === 'cli.output').length, outputs);
	assert.equal(h.host.kills, 1);
	assert.equal(h.timers.size, 0);
	h.manager.dispose();
});

test('resize is deferred until ready and uses the newest dimensions', () => {
	const h = harness();
	h.send('cli.resize', { cols: 110, rows: 36 });
	h.send('cli.input', { data: 'too early' });
	assert.equal(h.host.sent.length, 1);
	assert.equal(h.host.sent[0].type, 'start');
	h.host.emit('message', { type: 'ready' });
	assert.deepEqual(JSON.parse(JSON.stringify(h.host.sent[1])), { type: 'resize', cols: 110, rows: 36 });
	assert.equal(h.timers.size, 0);
	h.send('cli.input', { data: 'ready input' });
	assert.equal(h.host.sent.at(-1).data, 'ready input');
	h.manager.dispose();
});

for (const failure of ['callback', 'throw']) {
	test(`IPC ${failure} failure terminates the session once`, () => {
		const h = harness();
		h.host.emit('message', { type: 'ready' });
		h.host.sendFailure = failure;
		h.send('cli.input', { data: 'hello' });
		assert.equal(h.state().sessions[0].status, 'error');
		assert.match(h.output(), /IPC failure/);
		assert.equal(h.host.kills, 1);
		const sent = h.host.sent.length;
		h.send('cli.resize', { cols: 100, rows: 30 });
		assert.equal(h.host.sent.length, sent);
		h.manager.dispose();
	});
}

test('unexpected disconnect fails, but normal CLI exit and later disconnect do not', () => {
	const failed = harness();
	failed.host.emit('disconnect');
	assert.equal(failed.state().sessions[0].status, 'error');
	assert.match(failed.output(), /disconnected unexpectedly/);
	failed.manager.dispose();
	const normal = harness();
	normal.host.emit('message', { type: 'ready' });
	normal.host.emit('message', { type: 'exit', exitCode: 7 });
	normal.host.emit('disconnect');
	normal.host.emit('exit', 0, null);
	assert.equal(normal.state().sessions[0].status, 'exited');
	assert.equal(normal.state().sessions[0].exitCode, 7);
	assert.doesNotMatch(normal.output(), /unexpectedly|Could not|before the CLI/);
	assert.equal(normal.timers.size, 0);
	normal.manager.dispose();
});

test('startup timeout terminates an unready host and closing clears its timer', () => {
	const h = harness();
	const startup = [...h.timers.entries()].find(([, timer]) => timer.delay === 10000);
	assert.ok(startup, 'startup must have a bounded readiness timeout');
	h.timers.delete(startup[0]);
	startup[1].callback();
	assert.equal(h.state().sessions[0].status, 'error');
	assert.match(h.output(), /did not become ready/);
	assert.equal(h.host.kills, 1);
	h.manager.dispose();
	const closing = harness();
	assert.equal(closing.send('cli.close'), 'closed-last-session');
	assert.equal(closing.host.sent.at(-1).type, 'kill');
	assert.equal(closing.host.kills, 1);
	assert.equal(closing.timers.size, 0);
	closing.host.emit('error', new Error('late close'));
	closing.host.emit('disconnect');
	closing.manager.postState();
	assert.equal(closing.state().sessions.length, 0);
	assert.equal(closing.output(), '');
});

test('normal exit settles a pending response hook once after recording final output', () => {
	const h = harness();
	h.host.emit('message', { type: 'ready' });
	h.send('cli.input', { data: 'prepare\r' });
	let settled = 0;
	h.manager.onceResponseSettled(h.sessionId, () => {
		settled++;
		assert.equal(h.manager.bufferContains(h.sessionId, 'READY_MARKER'), true);
		assert.equal(h.state().sessions[0].status, 'exited');
	});
	h.host.emit('message', { type: 'output', data: 'READY_MARKER\r\n' });
	h.host.emit('message', { type: 'exit', exitCode: 0 });
	h.host.emit('disconnect');
	assert.equal(settled, 1);
	assert.equal(h.timers.size, 0);
	h.manager.dispose();
});

test('a missing Node runtime reports one actionable startup error', () => {
	const h = harness();
	h.host.emit('error', Object.assign(new Error('spawn node ENOENT'), { code: 'ENOENT' }));
	assert.equal(h.state().sessions[0].status, 'error');
	assert.match(h.output(), /CLIHUB_NODE_PATH/);
	assert.match(h.output(), /ENOENT/);
	assert.equal(h.timers.size, 0);
	h.manager.dispose();
});

test('failed boot releases idle waiters and cancels their fallback timers', async () => {
	const h = harness();
	const idle = h.manager.waitForFirstIdle(h.sessionId);
	h.host.emit('message', { type: 'error', message: 'native load failed' });
	await idle;
	assert.equal(h.timers.size, 0);
	h.manager.dispose();
});

test('loader preserves the native binary failure hidden by node-pty fallback paths', () => {
	const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-native-loader-'));
	try {
		fs.writeFileSync(path.join(fixture, 'package.json'), '{}');
		const binary = path.join(fixture, 'build/Release/pty.node');
		fs.mkdirSync(path.dirname(binary), { recursive: true });
		fs.writeFileSync(binary, 'invalid native library');
		const fixtureRequire = (name) => {
			if (name === 'node-pty') { throw new Error('Cannot find module ./prebuilds/fallback/pty.node'); }
			return projectRequire(name);
		};
		fixtureRequire.resolve = () => path.join(fixture, 'package.json');
		const { loadNativePty } = evaluate(loaderCode, { require: fixtureRequire });
		assert.throws(loadNativePty, (error) => {
			assert.match(error.message, /build\/Release\/pty\.node/);
			assert.match(error.message, /Update or reinstall F1/);
			assert.doesNotMatch(error.message, /Cannot find module \.\/prebuilds\/fallback/);
			return true;
		});
	} finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});

function actualHost(t) {
	const host = spawn(process.execPath, [path.join(root, 'dist/my-cli/core/pty-host.js')], {
		cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc']
	});
	const messages = [];
	const events = new EventEmitter();
	let ended;
	let stderr = '';
	let output = '';
	host.stderr.on('data', (chunk) => { stderr += chunk; });
	host.on('message', (message) => {
		messages.push(message);
		if (message.type === 'output') { output += message.data; }
		events.emit('update');
	});
	const exited = new Promise((resolve, reject) => {
		host.on('error', reject);
		host.on('exit', (code, signal) => { ended = { code, signal }; events.emit('update'); resolve(ended); });
	});
	t.after(() => { if (host.exitCode === null && !host.killed) { host.kill(); } });
	const wait = (predicate) => new Promise((resolve, reject) => {
		const inspect = () => {
			const found = messages.find(predicate);
			if (found) { events.off('update', inspect); resolve(found); }
			else if (ended) { events.off('update', inspect); reject(new Error(`PTY host exited early: ${JSON.stringify(ended)} ${stderr}`)); }
		};
		events.on('update', inspect); inspect();
	});
	const start = (script) => host.send({ type: 'start', command: process.execPath, args: ['-e', script], cwd: root, cols: 80, rows: 24, env: process.env });
	const waitOutput = (text) => wait(() => output.includes(text)).then(() => output);
	return { host, messages, exited, wait, waitOutput, start };
}

test('compiled PTY host accepts input and resize and reports a normal exit', { timeout: 10000 }, async (t) => {
	const h = actualHost(t);
	h.start('process.stdin.setEncoding("utf8"); process.stdin.on("data", d => { if(d.includes("probe")) process.stdout.write("ROUNDTRIP:" + process.stdin.isTTY + ":" + process.stdout.isTTY + "\\n", () => process.exit(0)); }); process.stdout.write("CHILD_READY\\n");');
	await h.wait((message) => message.type === 'ready');
	await h.waitOutput('CHILD_READY');
	h.host.send({ type: 'resize', cols: 100, rows: 30 });
	h.host.send({ type: 'input', data: 'probe\r' });
	await h.waitOutput('ROUNDTRIP:true:true');
	assert.equal((await h.wait((message) => message.type === 'exit')).exitCode, 0);
	assert.equal((await h.exited).code, 0);
	assert.equal(h.messages.filter((message) => message.type === 'error').length, 0);
});

test('compiled PTY host shuts down after its parent disconnects', { timeout: 10000 }, async (t) => {
	const h = actualHost(t);
	h.start('process.stdin.resume(); process.stdout.write("CHILD_PID:" + process.pid + "\\n");');
	const output = await h.waitOutput('\n');
	const childPid = Number(output.match(/CHILD_PID:(\d+)/)[1]);
	h.host.disconnect();
	assert.equal((await h.exited).code, 0);
	let alive = true;
	for (let attempt = 0; attempt < 80 && alive; attempt++) {
		try { process.kill(childPid, 0); await new Promise((resolve) => setTimeout(resolve, 25)); }
		catch (error) { if (error.code !== 'ESRCH') { throw error; } alive = false; }
	}
	assert.equal(alive, false, 'the CLI child must not remain running after IPC disconnect');
});
