import path from 'node:path';
import fs from 'node:fs';

const EXTENSIONS = ['.ts', '.tsx', '.d.ts'];

export class ImportResolver {
  constructor(private readonly repositoryRoot: string) {}

  resolveImport(fromFile: string, importSpecifier: string): string | undefined {
    if (importSpecifier.startsWith('.')) {
      return this.resolveCandidate(path.resolve(path.dirname(fromFile), importSpecifier));
    }

    if (importSpecifier.startsWith('@/')) {
      return this.resolveCandidate(path.resolve(this.repositoryRoot, importSpecifier.slice(2)));
    }

    if (importSpecifier.startsWith('src/')) {
      return this.resolveCandidate(path.resolve(this.repositoryRoot, importSpecifier));
    }

    return undefined;
  }

  private resolveCandidate(candidate: string): string | undefined {
    const direct = this.tryFile(candidate);
    if (direct) return direct;

    const indexFile = this.tryFile(path.join(candidate, 'index'));
    if (indexFile) return indexFile;

    return undefined;
  }

  private tryFile(candidate: string): string | undefined {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return this.toRepositoryRelative(candidate);
    }

    for (const extension of EXTENSIONS) {
      const withExtension = `${candidate}${extension}`;
      if (fs.existsSync(withExtension) && fs.statSync(withExtension).isFile()) {
        return this.toRepositoryRelative(withExtension);
      }
    }

    return undefined;
  }

  private toRepositoryRelative(filePath: string): string {
    return path.relative(this.repositoryRoot, filePath).split(path.sep).join('/');
  }
}
