# Native terminal release checks

CLI Hub runs `node-pty` in a separate system Node process. My Memory's file scanning and instruction updates do not use this native module. Keep the terminal in its separate process; do not run it under Electron-as-Node.

## Build and verify

Use an official standalone Node distribution for the build (Node 24 is used for this fix) and Bun for dependency management:

```sh
bun install --frozen-lockfile
bun compile
bun check-native
bun test:terminal
```

`vscode:prepublish` runs these checks automatically when VSCE packages the extension. The native check uses `node`, not Bun. On build machines containing Linux native artifacts it also needs `readelf` from binutils. It rejects any `libnode.so*` dependency and tests actual PTY input/output, resize and exit on the current platform.

If an existing Linux native build cannot load, rebuild it using the standalone Node selected in your PATH:

```sh
npm rebuild node-pty --foreground-scripts
bun check-native
```

This npm command repairs the installed native dependency; continue using Bun and `bun.lock` for the project. Do not set `npm_config_build_from_source=true`: node-pty 1.1.0 removes the entire prebuilds directory with that flag, including upstream Windows/macOS binaries.

## Package for the intended platform

Build in a clean environment for each OS/architecture you publish, then use VSCE's target flag, for example on Linux x64:

```sh
bunx @vscode/vsce package --target linux-x64
```

The same VSIX can then be uploaded to Visual Studio Marketplace or Open VSX. Keep `ARCHITECTURE.md`, `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` out of the packaging staging directory, as required by this repository's packaging rules. `.vscodeignore` also excludes contributor documentation and release tooling from the VSIX.

A universal VSIX is only valid for platforms whose binaries it actually contains. In node-pty 1.1.0, Linux typically uses the locally compiled `build/Release/pty.node`; upstream Windows/macOS prebuilds do not provide Linux ARM64 or Alpine support. Do not label a package for another architecture just by changing `--target`.

Build Linux artifacts on the oldest distribution you support and test each final VSIX in a clean editor installation. A local Linux check does not establish compatibility with other glibc versions, Windows, macOS or other editor builds.

After extracting a VSIX, recheck its actual shipped dependencies:

```sh
node scripts/check-native.cjs /absolute/path/to/extracted/extension
```

The test script stays in the source checkout; its optional argument selects the extracted extension. Verify its CLI Hub in the intended editor before publishing. Increment the manifest version for each release; publishing is a separate maintainer action.

References: [VS Code platform-specific extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#platform-specific-extensions), [Node-API and external-library compatibility](https://nodejs.org/api/n-api.html#implications-of-abi-stability).
