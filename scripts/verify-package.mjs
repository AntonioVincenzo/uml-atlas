import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-package-'));
const run = (command, args) => new Promise((resolve, reject) => { const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c); child.on('error', reject); child.on('close', code => code === 0 ? resolve(output) : reject(new Error(output))); });
let server; let client;
try {
  await run('npm', ['install', '--prefix', root, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', path.resolve('artifacts/atlas-architecture-studio-0.1.0.tgz')]);
  const cli = path.join(root, 'node_modules/atlas-architecture-studio/dist/server/cli.js'); const workspace = path.join(root, 'project');
  await run(process.execPath, [cli, 'init', '--workspace', workspace, '--demo']);
  const free = createServer(); await new Promise(r => free.listen(0, '127.0.0.1', r)); const port = free.address().port; await new Promise(r => free.close(r));
  server = spawn(process.execPath, [cli, 'serve', '--workspace', workspace, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Packaged server startup timed out')), 10000); server.stdout.once('data', () => { clearTimeout(timer); resolve(); }); server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); }); });
  const response = await fetch(`http://127.0.0.1:${port}`); assert.equal(response.status, 200); assert.match(await response.text(), /Atlas/);
  const report = await fetch(`http://127.0.0.1:${port}/uml-comparison.html`); assert.equal(report.status, 200); assert.match(await report.text(), /Proper UML notation beside its Atlas equivalent/);
  client = new Client({ name: 'packaged-atlas-smoke', version: '0.1.0' }); await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp', '--workspace', workspace] }));
  const tools = await client.listTools(); assert.equal(tools.tools.length, 10);
  const result = await client.callTool({ name: 'get_architecture', arguments: {} }); assert.equal(JSON.parse(result.content[0].text).document.diagrams.length, 3);
  console.log('Package verified: clean installation, CLI initialization, production HTTP app and UML report, and stdio MCP with 10 tools.');
} finally { if (client) await client.close(); if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(r => server.once('exit', r)); } await rm(root, { recursive: true, force: true }); }
