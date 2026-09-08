#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { createApp } from './http.js';
import { startMcp } from './mcp.js';
import { exampleDocument } from '../core/example.js';
const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => { const index = args.indexOf(name); if (index < 0) return fallback; if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`); return args[index + 1]; };
const command = args[0] ?? 'serve';
const root = path.resolve(flag('--workspace', process.cwd()));
const store = new Store(root);
try {
  if (command === 'mcp') await startMcp(store);
  else if (command === 'init' || command === 'serve') {
    await store.init(args.includes('--demo') ? exampleDocument : undefined);
    if (command === 'init') console.log(`Architecture initialized in ${root}`);
    else {
      const port = Number(flag('--port', '4311'));
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be between 1024 and 65535');
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const uiDir = dir.endsWith(`${path.sep}src${path.sep}server`) ? path.resolve(dir, '../../dist/ui') : path.resolve(dir, '../ui');
      const server = createApp(store, uiDir, port).listen(port, '127.0.0.1', () => console.log(`Atlas is ready at http://127.0.0.1:${port}\nWorkspace: ${root}`));
      server.on('error', e => { console.error(e.message); process.exitCode = 1; });
    }
  } else if (command === '--help' || command === 'help') console.log('Atlas architecture studio\n\natlas serve [--workspace /path/to/project] [--port 4311] [--demo]\natlas init [--workspace /path/to/project] [--demo]\natlas mcp --workspace /path/to/project\n\n--demo seeds a new workspace with the self-describing Atlas model.');
  else throw new Error(`Unknown command: ${command}. Use atlas --help.`);
} catch (e) { console.error((e as Error).message); process.exitCode = 1; }
