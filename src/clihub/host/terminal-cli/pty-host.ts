import type * as pty from 'node-pty';
import type { PtyHostCommand } from '../../shared/protocol';

type StartMessage = Extract<PtyHostCommand, { type: 'start' }>;
type HostMessage = PtyHostCommand;

let ptyProcess: pty.IPty | undefined;

const send = (message: unknown) => {
	process.send?.(message);
};

const stop = () => {
	try {
		ptyProcess?.kill();
	} catch {
		// The process may already be gone.
	}
};

const start = (message: StartMessage) => {
	try {
		const nodePty = require('node-pty') as typeof pty;
		ptyProcess = nodePty.spawn(message.command, message.args, {
			name: 'xterm-256color',
			cols: message.cols,
			rows: message.rows,
			cwd: message.cwd,
			env: message.env
		});

		send({ type: 'ready' });
		ptyProcess.onData((data) => {
			send({ type: 'output', data });
		});
		ptyProcess.onExit((event) => {
			send({ type: 'exit', exitCode: event.exitCode, signal: event.signal });
			setTimeout(() => process.exit(0), 20);
		});
	} catch (error) {
		const details = error instanceof Error ? error.message : String(error);
		send({ type: 'error', message: `PTY engine failed: ${details}` });
		setTimeout(() => process.exit(1), 20);
	}
};

process.on('message', (message: HostMessage) => {
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
		stop();
		process.exit(0);
	}
});

process.on('disconnect', () => {
	stop();
	process.exit(0);
});
