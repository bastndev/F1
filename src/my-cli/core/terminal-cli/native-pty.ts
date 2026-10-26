import * as fs from 'fs';
import * as path from 'path';
import type * as pty from 'node-pty';

export const loadNativePty = (): typeof pty => {
	try {
		return require('node-pty') as typeof pty;
	} catch (error) {
		let details = error instanceof Error ? error.message : String(error);
		try {
			const root = path.dirname(require.resolve('node-pty/package.json'));
			const candidates = ['build/Release', 'build/Debug', `prebuilds/${process.platform}-${process.arch}`];
			const failures: string[] = [];
			for (const directory of candidates) {
				const binary = path.join(root, directory, 'pty.node');
				if (!fs.existsSync(binary)) {
					continue;
				}
				try {
					require(binary);
				} catch (cause) {
					failures.push(`${directory}/pty.node: ${cause instanceof Error ? cause.message : String(cause)}`);
				}
			}
			// node-pty reports only its last attempted path, hiding earlier loader
			// failures such as a missing libnode.so behind "Cannot find module".
			if (failures.length) {
				details = failures.join('\n');
			}
		} catch {
			// Preserve the original error if the package itself cannot be resolved.
		}
		throw new Error(
			`F1 could not load its native terminal module (${process.platform}-${process.arch}, Node ${process.version}, ${process.execPath}). `
			+ `${details}\nUpdate or reinstall F1 with a package built for your platform.`
		);
	}
};
