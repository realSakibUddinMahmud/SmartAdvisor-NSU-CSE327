import { CourseSection, DagNodeSummary, DagSummary } from '../types';
import { COURSE_CATALOG_DAG } from '../seedData';

export interface CurriculumCourseNode {
  code: string;
  title?: string;
  credits?: number;
  prerequisites: string[];
  minCreditsRequired?: number;
}

export class CurriculumCycleError extends Error {
  public readonly cyclePath: string[];

  constructor(cyclePath: string[]) {
    super(`Prerequisite cycle detected in curriculum graph: ${cyclePath.join(' -> ')}`);
    this.name = 'CurriculumCycleError';
    this.cyclePath = cyclePath;
  }
}

export function normalizeCourseCode(code: string): string {
  return code.replace(/\s+/g, '').trim().toUpperCase();
}

export function formatCourseCode(code: string): string {
  const trimmed = code.trim().toUpperCase();
  const match = trimmed.match(/^([A-Z]+)\s*(\d+)\s*([A-Z]*)$/);
  if (match) {
    return `${match[1]} ${match[2]}${match[3]}`;
  }
  return trimmed;
}

function dedupePrerequisites(lists: string[][]): string[] {
  const unique = new Map<string, string>();
  for (const list of lists) {
    for (const raw of list) {
      const pKey = normalizeCourseCode(raw);
      if (!pKey || unique.has(pKey)) continue;
      unique.set(pKey, formatCourseCode(raw));
    }
  }
  return Array.from(unique.values());
}

export class CurriculumGraph {
  private static instance: CurriculumGraph | null = null;

  private nodes: Map<string, Required<CurriculumCourseNode>> = new Map();
  // adjacency: prereqKey -> Set<dependentKey>
  private dependentsMap: Map<string, Set<string>> = new Map();

  private constructor() {
    this.loadGraph(
      COURSE_CATALOG_DAG.map((node) => ({
        code: node.code,
        title: node.title,
        credits: node.credits,
        prerequisites: [...node.prerequisites],
        minCreditsRequired: node.minCreditsRequired ?? 0
      }))
    );
  }

  public static getInstance(): CurriculumGraph {
    if (!CurriculumGraph.instance) {
      CurriculumGraph.instance = new CurriculumGraph();
    }
    return CurriculumGraph.instance;
  }

  public static resetInstance(): CurriculumGraph {
    CurriculumGraph.instance = new CurriculumGraph();
    return CurriculumGraph.instance;
  }

  /**
   * Builds internal structures for a candidate node set and validates there are no cycles.
   * Throws CurriculumCycleError without mutating existing graph state if a cycle exists.
   */
  public loadGraph(courseNodes: CurriculumCourseNode[]): void {
    const nextNodes = new Map<string, Required<CurriculumCourseNode>>();
    const nextDependents = new Map<string, Set<string>>();

    // First register explicit nodes
    for (const raw of courseNodes) {
      const key = normalizeCourseCode(raw.code);
      if (!key) continue;
      const existing = nextNodes.get(key);
      const prerequisites = dedupePrerequisites([
        existing?.prerequisites ?? [],
        raw.prerequisites
      ]);
      nextNodes.set(key, {
        code: formatCourseCode(raw.code),
        title: raw.title ?? existing?.title ?? formatCourseCode(raw.code),
        credits: raw.credits ?? existing?.credits ?? 3.0,
        prerequisites,
        minCreditsRequired: raw.minCreditsRequired ?? existing?.minCreditsRequired ?? 0
      });
      if (!nextDependents.has(key)) {
        nextDependents.set(key, new Set());
      }
    }

    // Ensure prerequisite references that weren't explicitly listed still exist as root nodes
    for (const [, node] of nextNodes) {
      for (const prereqCode of node.prerequisites) {
        const prereqKey = normalizeCourseCode(prereqCode);
        if (!nextNodes.has(prereqKey)) {
          nextNodes.set(prereqKey, {
            code: formatCourseCode(prereqCode),
            title: formatCourseCode(prereqCode),
            credits: 3.0,
            prerequisites: [],
            minCreditsRequired: 0
          });
        }
        if (!nextDependents.has(prereqKey)) {
          nextDependents.set(prereqKey, new Set());
        }
      }
    }

    // Build directed edges: prerequisite -> dependent
    for (const [key, node] of nextNodes) {
      for (const prereqCode of node.prerequisites) {
        const prereqKey = normalizeCourseCode(prereqCode);
        nextDependents.get(prereqKey)!.add(key);
      }
    }

    const cycles = this.findCycles(nextNodes, nextDependents);
    if (cycles.length > 0) {
      throw new CurriculumCycleError(cycles[0]);
    }

    this.nodes = nextNodes;
    this.dependentsMap = nextDependents;
  }

  public loadFromSections(sections: CourseSection[]): void {
    const byCode = new Map<string, CurriculumCourseNode>();
    for (const base of COURSE_CATALOG_DAG) {
      byCode.set(normalizeCourseCode(base.code), {
        code: base.code,
        title: base.title,
        credits: base.credits,
        prerequisites: [...base.prerequisites],
        minCreditsRequired: base.minCreditsRequired
      });
    }
    for (const sec of sections) {
      const key = normalizeCourseCode(sec.courseCode);
      const existing = byCode.get(key);
      const prereqs = dedupePrerequisites([
        existing?.prerequisites ?? [],
        sec.prerequisites
      ]);
      byCode.set(key, {
        code: formatCourseCode(sec.courseCode),
        title: sec.courseTitle,
        credits: sec.credits,
        prerequisites: prereqs,
        minCreditsRequired: sec.minCreditsRequired ?? existing?.minCreditsRequired
      });
    }
    this.loadGraph(Array.from(byCode.values()));
  }

  public detectCycles(candidateNodes?: CurriculumCourseNode[]): string[][] {
    if (!candidateNodes) {
      return this.findCycles(this.nodes, this.dependentsMap);
    }

    const tempNodes = new Map<string, Required<CurriculumCourseNode>>();
    const tempDeps = new Map<string, Set<string>>();

    for (const raw of candidateNodes) {
      const key = normalizeCourseCode(raw.code);
      if (!key) continue;
      const existing = tempNodes.get(key);
      tempNodes.set(key, {
        code: formatCourseCode(raw.code),
        title: raw.title ?? existing?.title ?? formatCourseCode(raw.code),
        credits: raw.credits ?? existing?.credits ?? 3.0,
        prerequisites: dedupePrerequisites([existing?.prerequisites ?? [], raw.prerequisites]),
        minCreditsRequired: raw.minCreditsRequired ?? existing?.minCreditsRequired ?? 0
      });
      if (!tempDeps.has(key)) {
        tempDeps.set(key, new Set());
      }
    }

    for (const [key, node] of tempNodes) {
      for (const prereq of node.prerequisites) {
        const pKey = normalizeCourseCode(prereq);
        if (!tempDeps.has(pKey)) {
          tempDeps.set(pKey, new Set());
          tempNodes.set(pKey, {
            code: formatCourseCode(prereq),
            title: formatCourseCode(prereq),
            credits: 3.0,
            prerequisites: [],
            minCreditsRequired: 0
          });
        }
        tempDeps.get(pKey)!.add(key);
      }
    }

    return this.findCycles(tempNodes, tempDeps);
  }

  private findCycles(
    nodesMap: Map<string, Required<CurriculumCourseNode>>,
    depsMap: Map<string, Set<string>>
  ): string[][] {
    // 0 = unvisited, 1 = visiting, 2 = visited
    const color = new Map<string, number>();
    const stack: string[] = [];
    const cycles: string[][] = [];

    const keys = Array.from(nodesMap.keys()).sort();
    for (const k of keys) {
      color.set(k, 0);
    }

    const dfs = (u: string) => {
      color.set(u, 1);
      stack.push(u);

      const neighbors = Array.from(depsMap.get(u) ?? []).sort();
      for (const v of neighbors) {
        const state = color.get(v) ?? 0;
        if (state === 1) {
          const idx = stack.indexOf(v);
          const cycleKeys = [...stack.slice(idx), v];
          cycles.push(cycleKeys.map((k) => nodesMap.get(k)?.code ?? k));
        } else if (state === 0) {
          dfs(v);
        }
      }

      stack.pop();
      color.set(u, 2);
    };

    for (const k of keys) {
      if (color.get(k) === 0) {
        dfs(k);
      }
    }

    return cycles;
  }

  private toClearedSet(clearedCourses: Array<string | { code: string }>): Set<string> {
    return new Set(
      clearedCourses.map((c) => normalizeCourseCode(typeof c === 'string' ? c : c.code))
    );
  }

  /**
   * Returns missing direct prerequisites (preserving catalog order).
   */
  public getMissingPrerequisites(
    courseCode: string,
    clearedCourses: Array<string | { code: string }>
  ): string[] {
    const key = normalizeCourseCode(courseCode);
    const node = this.nodes.get(key);
    if (!node) {
      return [];
    }

    const clearedSet = this.toClearedSet(clearedCourses);
    return node.prerequisites.filter((prereq) => !clearedSet.has(normalizeCourseCode(prereq)));
  }

  /**
   * Returns all missing transitive prerequisites for a course.
   */
  public getAllMissingPrerequisites(
    courseCode: string,
    clearedCourses: Array<string | { code: string }>
  ): string[] {
    const clearedSet = this.toClearedSet(clearedCourses);
    const visited = new Set<string>();
    const missing: string[] = [];

    const walk = (codeKey: string) => {
      const node = this.nodes.get(codeKey);
      if (!node) return;
      for (const prereq of node.prerequisites) {
        const pKey = normalizeCourseCode(prereq);
        if (!visited.has(pKey)) {
          visited.add(pKey);
          walk(pKey);
          if (!clearedSet.has(pKey)) {
            missing.push(this.nodes.get(pKey)?.code ?? formatCourseCode(prereq));
          }
        }
      }
    };

    walk(normalizeCourseCode(courseCode));
    return missing;
  }

  /**
   * Returns courses not yet cleared whose full prerequisite chain is satisfied.
   */
  public getNextEligibleCourses(clearedCourses: Array<string | { code: string }>): string[] {
    const clearedSet = this.toClearedSet(clearedCourses);
    const eligible: string[] = [];

    for (const key of Array.from(this.nodes.keys()).sort()) {
      if (clearedSet.has(key)) continue;
      const missing = this.getAllMissingPrerequisites(key, clearedCourses);
      if (missing.length === 0) {
        eligible.push(this.nodes.get(key)!.code);
      }
    }

    return eligible;
  }

  /**
   * Kahn's topological sort with alphabetical tie-breaking.
   */
  public getTopologicalOrder(): string[] {
    const inDegree = new Map<string, number>();
    for (const [key, node] of this.nodes) {
      inDegree.set(key, node.prerequisites.length);
    }

    const queue = Array.from(this.nodes.keys())
      .filter((k) => (inDegree.get(k) ?? 0) === 0)
      .sort();

    const order: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(this.nodes.get(current)!.code);

      const deps = Array.from(this.dependentsMap.get(current) ?? []).sort();
      for (const dep of deps) {
        const nextDeg = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, nextDeg);
        if (nextDeg === 0) {
          queue.push(dep);
          queue.sort();
        }
      }
    }

    return order;
  }

  /**
   * Longest prerequisite chain in the DAG (critical path).
   */
  public getCriticalPath(): string[] {
    const topoKeys = this.getTopologicalOrder().map((c) => normalizeCourseCode(c));
    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();

    for (const k of topoKeys) {
      dist.set(k, 1);
      prev.set(k, null);
    }

    for (const u of topoKeys) {
      const uDist = dist.get(u) ?? 1;
      for (const v of Array.from(this.dependentsMap.get(u) ?? []).sort()) {
        if (uDist + 1 > (dist.get(v) ?? 1)) {
          dist.set(v, uDist + 1);
          prev.set(v, u);
        }
      }
    }

    let bestEnd: string | null = null;
    let bestLen = 0;
    for (const k of topoKeys) {
      const d = dist.get(k) ?? 0;
      if (d > bestLen) {
        bestLen = d;
        bestEnd = k;
      }
    }

    const path: string[] = [];
    let cur = bestEnd;
    while (cur) {
      path.unshift(this.nodes.get(cur)!.code);
      cur = prev.get(cur) ?? null;
    }
    return path;
  }

  /**
   * Returns total count of downstream courses transitively unlocked by courseCode.
   */
  public getDependentsCount(courseCode: string): number {
    const startKey = normalizeCourseCode(courseCode);
    const seen = new Set<string>();
    const queue = [...(this.dependentsMap.get(startKey) ?? [])];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const nxt of this.dependentsMap.get(cur) ?? []) {
        if (!seen.has(nxt)) {
          queue.push(nxt);
        }
      }
    }

    return seen.size;
  }

  public getNodes(): Required<CurriculumCourseNode>[] {
    return Array.from(this.nodes.values());
  }

  public getDagSummary(clearedCourses: Array<string | { code: string }>): DagSummary {
    const clearedSet = this.toClearedSet(clearedCourses);
    const eligibleCourses = this.getNextEligibleCourses(clearedCourses);
    const eligibleSet = new Set(eligibleCourses.map((c) => normalizeCourseCode(c)));
    const blockedCourses: Record<string, string[]> = {};
    const nodes: DagNodeSummary[] = [];

    for (const key of Array.from(this.nodes.keys()).sort()) {
      const node = this.nodes.get(key)!;
      const cleared = clearedSet.has(key);
      const missing = cleared ? [] : this.getAllMissingPrerequisites(key, clearedCourses);
      const eligible = !cleared && eligibleSet.has(key);
      if (!cleared && missing.length > 0) {
        blockedCourses[node.code] = missing;
      }
      nodes.push({
        code: node.code,
        title: node.title,
        credits: node.credits,
        prerequisites: [...node.prerequisites],
        eligible,
        cleared,
        missingPrerequisites: missing
      });
    }

    return {
      eligibleCourses,
      blockedCourses,
      criticalPath: this.getCriticalPath(),
      hasCycle: false,
      topologicalOrder: this.getTopologicalOrder(),
      nodes
    };
  }
}
