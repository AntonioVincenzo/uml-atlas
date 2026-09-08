import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
await mkdir('artifacts', { recursive: true });
const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--pack-destination', 'artifacts', '--ignore-scripts', '--silent'], { stdio: 'inherit' });
child.on('error', e => { console.error(e.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
