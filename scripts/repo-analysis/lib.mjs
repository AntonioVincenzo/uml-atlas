import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, readlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const ANALYZER_VERSION = '0.1.0';
export const DEFAULT_IGNORES = new Set([
  '.git', '.atlas', '.repo-analysis', 'artifacts', 'coverage', 'dist', 'node_modules',
]);

const LANGUAGE_BY_EXTENSION = new Map(Object.entries({
  '.c': 'c', '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp', '.h': 'c-header', '.hpp': 'cpp-header',
  '.cs': 'csharp', '.css': 'css', '.go': 'go', '.html': 'html', '.java': 'java',
  '.js': 'javascript', '.jsx': 'javascript', '.json': 'json', '.kt': 'kotlin', '.kts': 'kotlin',
  '.lua': 'lua', '.m': 'objective-c', '.md': 'markdown', '.php': 'php', '.pl': 'perl',
  '.proto': 'protobuf', '.py': 'python', '.rb': 'ruby', '.rs': 'rust', '.scala': 'scala',
  '.mjs': 'javascript', '.puml': 'plantuml', '.sh': 'shell', '.sql': 'sql', '.swift': 'swift',
  '.toml': 'toml', '.ts': 'typescript', '.txt': 'text',
  '.tsx': 'typescript', '.vue': 'vue', '.xml': 'xml', '.yaml': 'yaml', '.yml': 'yaml',
  '.zig': 'zig',
}));

export function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`Unexpected argument: ${item}`);
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

export async function ensureDirectory(directory) {
  await mkdir(directory, { recursive: true });
}

export async function writeJson(file, value) {
  await ensureDirectory(path.dirname(file));
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeJsonLines(file, records) {
  await ensureDirectory(path.dirname(file));
  await writeFile(file, `${records.map(record => JSON.stringify(record)).join('\n')}\n`);
}

export async function readJsonLines(file) {
  const text = await readFile(file, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${file}:${index + 1}: ${error.message}`); }
  });
}

export async function collectPaths(root, ignores = DEFAULT_IGNORES) {
  const results = [];
  async function visit(relative) {
    const absolute = path.join(root, relative);
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      if (ignores.has(entry.name)) continue;
      const child = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) {
        results.push({ relative: child.split(path.sep).join('/'), type: 'symlink' });
      } else if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile()) {
        results.push({ relative: child.split(path.sep).join('/'), type: 'file' });
      }
    }
  }
  await visit('');
  return results;
}

export function classifyLanguage(uri) {
  const filename = path.posix.basename(uri).toLowerCase();
  if (filename === '.gitattributes') return 'git-attributes';
  if (filename === '.gitignore') return 'git-ignore';
  if (filename === 'dockerfile') return 'dockerfile';
  if (filename === 'makefile') return 'make';
  return LANGUAGE_BY_EXTENSION.get(path.posix.extname(filename)) ?? null;
}

export function classifyRole(uri) {
  const lower = uri.toLowerCase();
  const filename = path.posix.basename(lower);
  if (/^licenses\//.test(lower)) return 'vendored';
  if (/(^|\/)(test|tests|spec|specs|__tests__)(\/|$)/.test(lower) || /(?:^|[._-])(test|spec)\.[^.]+$/.test(filename)) return 'test';
  if (/(^|\/)(docs?|examples?)(\/|$)/.test(lower) || /\.(md|rst|adoc)$/.test(filename)) return 'documentation';
  if (/(^|\/)(vendor|third_party|external)(\/|$)/.test(lower)) return 'vendored';
  if (/^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|cargo\.lock|go\.sum)$/.test(filename)) return 'lockfile';
  if (/^(package\.json|tsconfig.*\.json|vite\.config\.|dockerfile|makefile|.*\.ya?ml$)/.test(filename)) return 'configuration';
  return 'source';
}

export function inspectBytes(bytes) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  const binary = sample.includes(0);
  if (binary) return { binary: true, lines: null, generatedHint: false };
  const text = bytes.toString('utf8');
  const lines = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length;
  const head = text.slice(0, 4096).toLowerCase();
  const generatedHint = /(@generated|generated (?:file|code)|do not edit|automatically generated)/.test(head)
    || (lines <= 3 && bytes.length > 50_000);
  return { binary: false, lines, generatedHint };
}

export async function artifactRecord(root, item) {
  const absolute = path.join(root, ...item.relative.split('/'));
  await lstat(absolute);
  if (item.type === 'symlink') {
    const target = await readlink(absolute);
    return {
      schemaVersion: 1, recordType: 'artifact', id: `artifact:${item.relative}`,
      uri: item.relative, artifactType: 'symlink', role: classifyRole(item.relative),
      language: null, mediaType: null, bytes: Buffer.byteLength(target), lines: null,
      contentHash: `sha256:${hash(target)}`, generatedHint: false, symlinkTarget: target,
      epistemic: { status: 'observed', confidence: 1, method: 'filesystem.lstat' },
    };
  }
  const bytes = await readFile(absolute);
  const inspection = inspectBytes(bytes);
  const language = classifyLanguage(item.relative);
  return {
    schemaVersion: 1, recordType: 'artifact', id: `artifact:${item.relative}`,
    uri: item.relative, artifactType: inspection.binary ? 'binary' : 'text',
    role: classifyRole(item.relative), language,
    mediaType: inspection.binary ? 'application/octet-stream' : 'text/plain',
    bytes: bytes.length, lines: inspection.lines, contentHash: `sha256:${hash(bytes)}`,
    generatedHint: inspection.generatedHint,
    epistemic: { status: 'observed', confidence: 1, method: 'filesystem.read' },
  };
}
