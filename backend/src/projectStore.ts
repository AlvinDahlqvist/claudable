import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Project } from '@claudable/shared/types.js';

export class ProjectStore {
  private projects: Project[] = [];
  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      this.projects = JSON.parse(raw) as Project[];
    } catch (err: any) {
      if (err.code === 'ENOENT') this.projects = [];
      else throw err;
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.projects, null, 2));
  }

  list(): Project[] { return [...this.projects]; }
  get(id: string): Project | undefined { return this.projects.find((p) => p.id === id); }

  async add(input: { name: string; path: string }): Promise<Project> {
    const project: Project = {
      id: randomUUID(),
      name: input.name,
      path: input.path,
      settings: {},
    };
    this.projects.push(project);
    await this.persist();
    return project;
  }

  async update(id: string, patch: Partial<Omit<Project, 'id'>>): Promise<Project> {
    const project = this.get(id);
    if (!project) throw new Error(`Unknown project: ${id}`);
    Object.assign(project, patch);
    await this.persist();
    return project;
  }

  async remove(id: string): Promise<void> {
    this.projects = this.projects.filter((p) => p.id !== id);
    await this.persist();
  }
}
