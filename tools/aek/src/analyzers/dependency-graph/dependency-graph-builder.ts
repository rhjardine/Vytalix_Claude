import path from 'node:path';
const { glob } = require('glob') as { glob: (pattern: string, options: Record<string, unknown>) => Promise<string[]> };
const { Project } = require('ts-morph') as { Project: new (options: Record<string, unknown>) => { addSourceFilesAtPaths(files: string[]): SourceFileLike[] } };

interface ImportDeclarationLike {
  getModuleSpecifierValue(): string;
}

interface SourceFileLike {
  getFilePath(): string;
  getImportDeclarations(): ImportDeclarationLike[];
}
import type { DependencyGraph } from './graph-types';
import { ImportResolver } from './import-resolver';

export class DependencyGraphBuilder {
  constructor(private readonly repositoryRoot: string) {}

  async build(): Promise<DependencyGraph> {
    const files = await glob('src/**/*.{ts,tsx}', {
      cwd: this.repositoryRoot,
      absolute: true,
      nodir: true,
      ignore: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx', '**/node_modules/**', '**/dist/**'],
    });

    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const sourceFiles = project.addSourceFilesAtPaths(files);
    const resolver = new ImportResolver(this.repositoryRoot);
    const edges = sourceFiles.flatMap((sourceFile) => {
      const from = this.toRepositoryRelative(sourceFile.getFilePath());
      return sourceFile.getImportDeclarations().flatMap((importDeclaration) => {
        const importSpecifier = importDeclaration.getModuleSpecifierValue();
        const to = resolver.resolveImport(sourceFile.getFilePath(), importSpecifier);
        return to ? [{ from, to, importSpecifier }] : [];
      });
    });

    return {
      files: files.map((file) => this.toRepositoryRelative(file)).sort(),
      edges: edges.sort((left, right) => `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`)),
    };
  }

  private toRepositoryRelative(filePath: string): string {
    return path.relative(this.repositoryRoot, filePath).split(path.sep).join('/');
  }
}
