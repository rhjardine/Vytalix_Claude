import type { DependencyGraph } from '../analyzers/dependency-graph/graph-types';

export class AnalysisContext {
  constructor(
    public readonly repositoryRoot: string,
    public readonly dependencyGraph: DependencyGraph,
  ) {}
}
