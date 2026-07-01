export interface DependencyEdge {
  from: string;
  to: string;
  importSpecifier: string;
}

export interface DependencyGraph {
  files: string[];
  edges: DependencyEdge[];
}
