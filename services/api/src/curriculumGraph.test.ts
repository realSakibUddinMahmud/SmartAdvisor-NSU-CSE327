import { describe, it, expect, beforeEach } from 'vitest';
import {
  CurriculumGraph,
  CurriculumCycleError,
  normalizeCourseCode
} from './services/curriculumGraph';
import { INITIAL_STUDENT, INITIAL_SECTIONS } from './seedData';

describe('CurriculumGraph Singleton DAG Engine', () => {
  beforeEach(() => {
    CurriculumGraph.resetInstance();
  });

  it('maintains Singleton identity via getInstance()', () => {
    const a = CurriculumGraph.getInstance();
    const b = CurriculumGraph.getInstance();
    expect(a).toBe(b);
  });

  it('normalizes course codes regardless of case or whitespace', () => {
    expect(normalizeCourseCode('cse425')).toBe('CSE425');
    expect(normalizeCourseCode('  CSE   425 ')).toBe('CSE425');

    const graph = CurriculumGraph.getInstance();
    const missing = graph.getMissingPrerequisites('cse425', ['cse115', 'cse 215']);
    expect(missing).toEqual(['CSE 311']);
  });

  it('evaluates seeded catalog eligibility and missing prerequisites accurately', () => {
    const graph = CurriculumGraph.getInstance();
    const eligible = graph.getNextEligibleCourses(INITIAL_STUDENT.clearedCourses);

    expect(eligible).toContain('CSE 327');
    expect(eligible).toContain('CSE 311L');
    expect(eligible).toContain('CSE 331');
    expect(eligible).toContain('CSE 425');
    expect(eligible).toContain('MAT 120');
    expect(eligible).not.toContain('MAT 361');

    const missingMat361 = graph.getMissingPrerequisites('MAT 361', INITIAL_STUDENT.clearedCourses);
    expect(missingMat361).toEqual(['MAT 120']);

    const missingCse425 = graph.getMissingPrerequisites('CSE 425', ['CSE 115']);
    expect(missingCse425).toEqual(['CSE 215', 'CSE 311']);
  });

  it('rejects 2-node, self-loop, and 3-node cycles with CurriculumCycleError without corrupting valid graph', () => {
    const graph = CurriculumGraph.getInstance();
    const initialPath = graph.getCriticalPath();

    // 2-node cycle A -> B -> A
    expect(() =>
      graph.loadGraph([
        { code: 'CSE 401', prerequisites: ['CSE 402'] },
        { code: 'CSE 402', prerequisites: ['CSE 401'] }
      ])
    ).toThrow(CurriculumCycleError);

    // Self-loop A -> A
    expect(() =>
      graph.loadGraph([{ code: 'CSE 499', prerequisites: ['CSE 499'] }])
    ).toThrow(CurriculumCycleError);

    // 3-node cycle A -> B -> C -> A
    let caught: CurriculumCycleError | undefined;
    try {
      graph.loadGraph([
        { code: 'CSE 501', prerequisites: ['CSE 503'] },
        { code: 'CSE 502', prerequisites: ['CSE 501'] },
        { code: 'CSE 503', prerequisites: ['CSE 502'] }
      ]);
    } catch (err) {
      caught = err as CurriculumCycleError;
    }

    expect(caught).toBeInstanceOf(CurriculumCycleError);
    expect(caught?.cyclePath.length).toBeGreaterThanOrEqual(3);

    // Prior valid graph remains intact
    expect(graph.getCriticalPath()).toEqual(initialPath);
  });

  it('computes critical path and topological order deterministically', () => {
    const graph = CurriculumGraph.getInstance();
    expect(graph.getCriticalPath()).toEqual(['CSE 115', 'CSE 215', 'CSE 311', 'CSE 425']);

    const topo = graph.getTopologicalOrder();
    expect(topo.indexOf('CSE 115')).toBeLessThan(topo.indexOf('CSE 215'));
    expect(topo.indexOf('CSE 215')).toBeLessThan(topo.indexOf('CSE 311'));
    expect(topo.indexOf('CSE 311')).toBeLessThan(topo.indexOf('CSE 425'));
  });

  it('computes downstream dependents count and full DagSummary', () => {
    const graph = CurriculumGraph.getInstance();
    expect(graph.getDependentsCount('CSE 115')).toBeGreaterThanOrEqual(6);
    expect(graph.getDependentsCount('CSE 425')).toBe(0);

    graph.loadFromSections(INITIAL_SECTIONS);
    const summary = graph.getDagSummary(INITIAL_STUDENT.clearedCourses);
    expect(summary.hasCycle).toBe(false);
    expect(summary.blockedCourses['MAT 361']).toEqual(['MAT 120']);
    expect(summary.eligibleCourses).toContain('CSE 327');
  });

  it('deduplicates mixed-format equivalent prerequisites so getTopologicalOrder and getCriticalPath never drop nodes', () => {
    const graph = CurriculumGraph.getInstance();
    graph.loadGraph([
      { code: 'CSE 215A', prerequisites: [] },
      { code: 'CSE 490', prerequisites: ['CSE 215 A', 'CSE 215A'] }
    ]);

    const topo = graph.getTopologicalOrder();
    expect(topo).toEqual(['CSE 215A', 'CSE 490']);

    const critical = graph.getCriticalPath();
    expect(critical).toEqual(['CSE 215A', 'CSE 490']);
  });

  it('detectCycles(candidateNodes) validates arbitrary candidate subgraphs directly without mutating graph', () => {
    const graph = CurriculumGraph.getInstance();
    const initialNodesCount = graph.getNodes().length;

    const cycles = graph.detectCycles([
      { code: 'CSE 601', prerequisites: ['CSE 602'] },
      { code: 'CSE 602', prerequisites: ['CSE 601'] }
    ]);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    expect(cycles[0]).toContain('CSE 601');
    expect(cycles[0]).toContain('CSE 602');

    const acyclic = graph.detectCycles([
      { code: 'CSE 601', prerequisites: [] },
      { code: 'CSE 602', prerequisites: ['CSE 601'] }
    ]);
    expect(acyclic).toEqual([]);
    expect(graph.getNodes()).toHaveLength(initialNodesCount);
  });

  it('handles empty loadGraph([]) safely with empty topological order and critical path', () => {
    const graph = CurriculumGraph.getInstance();
    graph.loadGraph([]);

    expect(graph.getNodes()).toEqual([]);
    expect(graph.getTopologicalOrder()).toEqual([]);
    expect(graph.getCriticalPath()).toEqual([]);
    expect(graph.detectCycles()).toEqual([]);

    const summary = graph.getDagSummary([]);
    expect(summary.eligibleCourses).toEqual([]);
    expect(summary.blockedCourses).toEqual({});
    expect(summary.hasCycle).toBe(false);
    expect(summary.nodes).toEqual([]);
  });
});
