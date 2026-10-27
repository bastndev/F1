import type * as pty from 'node-pty';
import type { PtyHostCommand, PtyHostEvent } from '../../shared/protocol';
import { loadNativePty } from './native-pty';

type StartMessage = Extract<PtyHostCommand, { type: 'start' }>;
type HostMessage = PtyHostCommand;

let ptyProcess: pty.IPty | undefined;
let shuttingDown = false;

const stop = () => {
	try {
		ptyProcess?.kill();
	} catch {
		// The process may already be gone.
	}
	ptyProcess = undefined;
};

const shutdown = (code: number) => {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	stop();
	process.exit(code);
};

const send = (message: PtyHostEvent, onSent?: () => void) => {
	if (shuttingDown) {
		return;
	}
	if (!process.connected || !process.send) {
		shutdown(0);
		return;
	}
	try {
		process.send(message, (error: Error | null) => {
			if (error) {
				shutdown(1);
				return;
			}
			onSent?.();
		});
	} catch {
		shutdown(1);
	}
};

const fail = (error: unknown) => {
	const details = error instanceof Error ? error.message : String(error);
	send({ type: 'error', message: `PTY engine failed: ${details}` }, () => shutdown(1));
};

const start = (message: StartMessage) => {
	try {
		if (ptyProcess) {
			throw new Error('A terminal is already running in this host.');
		}
		if (process.versions.electron) {
			throw new Error('CLIHUB_NODE_PATH must point to a standalone Node.js executable, not the editor executable.');
		}
		const nodePty = loadNativePty();
		ptyProcess = nodePty.spawn(message.command, message.args, {
			name: 'xterm-256color',
			cols: message.cols,
			rows: message.rows,
			cwd: message.cwd,
			env: message.env
		});

		ptyProcess.onData((data) => {
			send({ type: 'output', data });
		});
		ptyProcess.onExit((event) => {
			ptyProcess = undefined;
			send({ type: 'exit', exitCode: event.exitCode, signal: event.signal }, () => shutdown(0));
		});
		send({ type: 'ready' });
	} catch (error) {
		fail(error);
	}
};

process.on('message', (message: HostMessage) => {
	try {
		if (message.type === 'start') {
			start(message);
			return;
		}

		if (message.type === 'input') {
			ptyProcess?.write(message.data);
			return;
		}

		if (message.type === 'resize') {
			ptyProcess?.resize(message.cols, message.rows);
			return;
		}

		if (message.type === 'kill') {
			shutdown(0);
		}
	} catch (error) {
		fail(error);
	}
});

process.on('disconnect', () => {
	shutdown(0);
});

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
