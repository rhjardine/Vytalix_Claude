// =============================================================================
// repository-scanner.ts — AEK v1.1 Governance filesystem analyzer
//
// Builds a RepositorySnapshot from the working tree. Read-only: performs NO
// writes and mutates NO repository state. Used by hygiene / docs / ADR rules.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import type { AdrFolderInfo, RepositorySnapshot } from '../governance-types';

// Mandatory governance documents expected to exist (repo-relative).
// Derived from the canonical set established across E0/E2.
const MANDATORY_GOVERNANCE_DOCS: readonly string[] = [
  'docs/governance/README.md',
  'docs/governance/PROGRAM_CHARTER.md',
  'docs/governance/TECHNICAL_GOVERNANCE.md',
  'docs/governance/SECURITY_GOVERNANCE.md',
  'docs/governance/QUALITY_GATES.md',
  'docs/governance/CHANGE_MANAGEMENT.md',
  'docs/governance/RELEASE_GOVERNANCE.md',
  'docs/REPOSITORY_MANIFEST.md',
  'docs/REPOSITORY_TOPOLOGY.md',
];

const ADR_ROOT = 'src/dental/docs/trd/adr';

export class RepositoryScanner {
  constructor(private readonly repositoryRoot: string) {}

  scan(): RepositorySnapshot {
    return {
      rootFiles: this.listRootFiles(),
      governanceDocs: this.checkGovernanceDocs(),
      adrFolders: this.scanAdrFolders(),
    };
  }

  static get mandatoryDocs(): readonly string[] {
    return MANDATORY_GOVERNANCE_DOCS;
  }

  private listRootFiles(): string[] {
    try {
      return fs
        .readdirSync(this.repositoryRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }

  private checkGovernanceDocs(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const docPath of MANDATORY_GOVERNANCE_DOCS) {
      result[docPath] = this.exists(docPath);
    }
    return result;
  }

  private scanAdrFolders(): AdrFolderInfo[] {
    const adrAbs = path.join(this.repositoryRoot, ADR_ROOT);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(adrAbs, { withFileTypes: true });
    } catch {
      return [];
    }

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.inspectAdrFolder(adrAbs, entry.name))
      .sort((a, b) => a.folder.localeCompare(b.folder));
  }

  private inspectAdrFolder(adrAbs: string, folder: string): AdrFolderInfo {
    const folderAbs = path.join(adrAbs, folder);
    let docFile: string | null = null;
    try {
      const files = fs.readdirSync(folderAbs);
      docFile = files.find((f) => /^ADR-\d+.*\.md$/i.test(f)) ?? null;
    } catch {
      docFile = null;
    }

    if (!docFile) {
      return { folder, docFile: null, hasStatus: false, title: null };
    }

    let content = '';
    try {
      content = fs.readFileSync(path.join(folderAbs, docFile), 'utf8');
    } catch {
      content = '';
    }

    const titleMatch = content.match(/^#\s+(.+)$/m);
    const hasStatus = /(^|\n)#{1,3}\s*(Estado|Status)\b/i.test(content);

    return {
      folder,
      docFile,
      hasStatus,
      title: titleMatch ? titleMatch[1].trim() : null,
    };
  }

  private exists(relativePath: string): boolean {
    try {
      return fs.existsSync(path.join(this.repositoryRoot, relativePath));
    } catch {
      return false;
    }
  }
}
