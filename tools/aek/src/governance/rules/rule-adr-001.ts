// =============================================================================
// rule-adr-001.ts — RULE-ADR-001 · ADR Integrity (WARNING)
//
// Validates ADR folder integrity:
//   - each ADR folder contains an ADR-NNN.md document
//   - each ADR document declares a Status/Estado
//   - folder name is consistent with the document title (detects naming drift)
// WARNING-only; read-only (never edits ADRs — ADRs are authority).
// =============================================================================

import type { GovernanceContext, GovernanceRule, GovernanceRuleResult, GovernanceFinding } from '../governance-types';

// Normalize for loose comparison between folder name and document title.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Extract the ADR identifier (e.g. "ADR-001") from a folder or title.
function adrId(text: string): string | null {
  const match = text.match(/ADR-\d+/i);
  return match ? match[0].toUpperCase() : null;
}

export const ruleAdr001: GovernanceRule = {
  id: 'RULE-ADR-001',
  category: 'governance',
  description:
    'Every ADR folder must contain an ADR-NNN.md with a declared status, and the folder name must be consistent with the document title.',
  evaluate(context: GovernanceContext): GovernanceRuleResult {
    const findings: GovernanceFinding[] = [];

    for (const adr of context.snapshot.adrFolders) {
      if (!adr.docFile) {
        findings.push({
          ruleId: this.id,
          category: this.category,
          severity: 'warning',
          message: `ADR folder '${adr.folder}' contains no ADR-NNN.md document.`,
          target: adr.folder,
        });
        continue;
      }

      if (!adr.hasStatus) {
        findings.push({
          ruleId: this.id,
          category: this.category,
          severity: 'warning',
          message: `ADR '${adr.docFile}' does not declare a Status/Estado section.`,
          target: `${adr.folder}/${adr.docFile}`,
        });
      }

      // Folder-name vs title drift (do NOT rename — ADRs are authority).
      if (adr.title) {
        const folderId = adrId(adr.folder);
        const titleId = adrId(adr.title);
        const folderTopic = normalize(adr.folder.replace(/ADR-\d+/i, ''));
        const titleTopic = normalize(adr.title.replace(/ADR-\d+/i, '').replace(/^[—\-:\s]+/, ''));

        const idMismatch = folderId !== null && titleId !== null && folderId !== titleId;
        // Topic drift: neither contains a shared significant token.
        const folderTokens = new Set(folderTopic.split(' ').filter((t) => t.length > 3));
        const sharesToken = [...folderTokens].some((t) => titleTopic.includes(t));
        const topicDrift = folderTopic.length > 0 && titleTopic.length > 0 && !sharesToken;

        if (idMismatch || topicDrift) {
          findings.push({
            ruleId: this.id,
            category: this.category,
            severity: 'warning',
            message: `ADR folder name drifts from document title: folder '${adr.folder}' vs title '${adr.title}'.`,
            target: `${adr.folder}/${adr.docFile}`,
          });
        }
      }
    }

    return { ruleId: this.id, findings };
  },
};
