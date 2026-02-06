/**
 * Step 3d: Connection Resolution (TypeScript only)
 *
 * Resolves port-based cross-chapter connections to actual node IDs.
 * Adds backConnections for navigation loops.
 */

import type { GraphNode, StoryGraph } from './scene-generator';
import type { ChapterStructure } from './chapter-generator';
import type { ActStructure } from './act-generator';

interface ChapterGraph {
  chapterId: string;
  nodes: GraphNode[];
}

/**
 * Resolve port-based connections across chapters into a unified StoryGraph.
 *
 * Port resolution rules:
 * 1. A node's connection referencing a port name (e.g., "to_ch_2_main")
 *    gets resolved to the first node in the target chapter that lists
 *    that port in its backConnections or is the chapter's first node.
 * 2. BackConnections to hub/checkpoint nodes are injected.
 */
export function resolveConnections(
  actStructure: ActStructure,
  chapterStructures: ChapterStructure[],
  chapterGraphs: ChapterGraph[],
): StoryGraph {
  // Collect all nodes
  const allNodes: GraphNode[] = [];
  const nodeById = new Map<string, GraphNode>();
  const portToNodeId = new Map<string, string>();

  // Build port map: port name → first node that serves that port
  for (const cg of chapterGraphs) {
    const chapter = chapterStructures
      .flatMap((cs) => cs.chapters)
      .find((c) => c.id === cg.chapterId);

    if (chapter) {
      // Map entry ports to the first node in this chapter
      for (const port of chapter.entryPorts) {
        if (cg.nodes.length > 0 && !portToNodeId.has(port)) {
          portToNodeId.set(port, cg.nodes[0].id);
        }
      }
    }

    for (const node of cg.nodes) {
      allNodes.push(node);
      nodeById.set(node.id, node);
    }
  }

  // Resolve connections: replace port references with actual node IDs
  const allNodeIds = new Set(allNodes.map((n) => n.id));

  for (const node of allNodes) {
    node.connections = node.connections.map((conn) => {
      // If it's already a valid node ID, keep it
      if (allNodeIds.has(conn)) return conn;
      // If it's a port name, resolve it
      const resolved = portToNodeId.get(conn);
      if (resolved) return resolved;
      // Can't resolve — keep as-is (validation will catch it later)
      return conn;
    });

    node.backConnections = node.backConnections.map((conn) => {
      if (allNodeIds.has(conn)) return conn;
      const resolved = portToNodeId.get(conn);
      if (resolved) return resolved;
      return conn;
    });
  }

  // Inject backConnections to hub nodes
  const hubNodes = allNodes.filter(
    (n) => n.type === 'checkpoint' || n.type === 'choice',
  );

  for (const node of allNodes) {
    if (node.type === 'ending') continue;
    if (hubNodes.some((h) => h.id === node.id)) continue;

    // If node has no backConnections, add one to the nearest hub
    if (node.backConnections.length === 0) {
      const sameLocationHub = hubNodes.find(
        (h) => h.locationId === node.locationId,
      );
      const nearestHub = sameLocationHub ?? hubNodes[0];
      if (nearestHub) {
        node.backConnections.push(nearestHub.id);
      }
    }
  }

  // Determine start node
  const startNodeId =
    portToNodeId.get('game_start') ??
    allNodes[0]?.id ??
    '';

  // Build act structure for the StoryGraph
  const graphActStructure = actStructure.acts.map((act) => {
    const actChapters = chapterStructures
      .flatMap((cs) => cs.chapters)
      .filter((c) => c.actId === act.id);
    const actNodeIds = chapterGraphs
      .filter((cg) => actChapters.some((c) => c.id === cg.chapterId))
      .flatMap((cg) => cg.nodes.map((n) => n.id));

    return {
      act: parseInt(act.id.replace('act_', ''), 10) || 1,
      nodeIds: actNodeIds,
      description: act.summary,
    };
  });

  return {
    nodes: allNodes,
    startNodeId,
    actStructure: graphActStructure,
  };
}
