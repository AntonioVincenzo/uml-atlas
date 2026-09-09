import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const projectRecordSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1).max(200),
  onboardedAt: z.string(),
  lastOpenedAt: z.string(),
}).strict();
const catalogSchema = z.object({ schemaVersion: z.literal(1), projects: z.array(projectRecordSchema) }).strict();
type ProjectRecord = z.infer<typeof projectRecordSchema>;
export type OnboardedProject = ProjectRecord & { available: boolean };

export const defaultProjectCatalogPath = () => path.join(os.homedir(), '.atlas', 'projects.json');

export class ProjectCatalog {
  constructor(readonly file = defaultProjectCatalogPath()) {}

  private async read() {
    try { return catalogSchema.parse(JSON.parse(await readFile(this.file, 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1 as const, projects: [] }; throw error; }
  }

  private async atomic(data: unknown) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' }); await rename(temporary, this.file); }
    finally { await rm(temporary, { force: true }); }
  }

  private async locked<T>(operation: () => Promise<T>) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const lock = `${this.file}.lock`; let acquired = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await mkdir(lock); acquired = true; break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; await new Promise(resolve => setTimeout(resolve, 30)); }
    }
    if (!acquired) throw new Error('The Atlas project catalog is busy. Retry shortly.');
    try { return await operation(); } finally { await rm(lock, { recursive: true, force: true }); }
  }

  private fallbackName(root: string, documentName: string) {
    return documentName === 'Untitled architecture' ? path.basename(root) || root : documentName;
  }

  async ensure(root: string, documentName: string) {
    const projectPath = path.resolve(root);
    return this.locked(async () => {
      const catalog = await this.read(); const existing = catalog.projects.find(project => project.path === projectPath);
      if (existing) return existing;
      const now = new Date().toISOString(); const project = { path: projectPath, name: this.fallbackName(projectPath, documentName), onboardedAt: now, lastOpenedAt: now };
      catalog.projects.push(project); await this.atomic(catalog); return project;
    });
  }

  async open(root: string, documentName: string, requestedName?: string) {
    const projectPath = path.resolve(root); const explicitName = requestedName?.trim();
    return this.locked(async () => {
      const catalog = await this.read(); const existing = catalog.projects.find(project => project.path === projectPath); const now = new Date().toISOString();
      if (existing) { existing.lastOpenedAt = now; if (explicitName) existing.name = explicitName; await this.atomic(catalog); return existing; }
      const project = { path: projectPath, name: explicitName || this.fallbackName(projectPath, documentName), onboardedAt: now, lastOpenedAt: now };
      catalog.projects.push(project); await this.atomic(catalog); return project;
    });
  }

  async list(): Promise<OnboardedProject[]> {
    const catalog = await this.read();
    const projects = await Promise.all(catalog.projects.map(async project => {
      try { return { ...project, available: (await stat(project.path)).isDirectory() }; }
      catch { return { ...project, available: false }; }
    }));
    return projects.sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
  }
}
