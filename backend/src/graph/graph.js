/**
 * Builds a commit graph from plain commit data.
 * Input:  [{ sha, parents: [sha, ...], timestamp }]  (first parent first)
 * Output: Map<sha, { sha, timestamp, parents, children, missingParents }>
 *
 * Parents that are not in the input (e.g. a shallow import) are skipped and
 * counted in `missingParents`, so traversals never crash on partial history.
 */
export function buildGraph(commits) {
  const graph = new Map();
  const rawParents = new Map();

  for (const c of commits) {
    if (graph.has(c.sha)) continue; // duplicate prevention
    graph.set(c.sha, {
      sha: c.sha,
      timestamp: c.timestamp ?? 0,
      parents: [],
      children: [],
      missingParents: 0,
    });
    rawParents.set(c.sha, c.parents ?? []);
  }

  for (const node of graph.values()) {
    for (const p of rawParents.get(node.sha)) {
      if (graph.has(p)) {
        node.parents.push(p);
        graph.get(p).children.push(node.sha);
      } else {
        node.missingParents++;
      }
    }
  }
  return graph;
}

function assertKnown(graph, sha) {
  if (!graph.has(sha)) throw new Error(`Unknown commit: ${sha}`);
}

// Iterative depth-first walk (no recursion, so very long histories are safe).
// Includes the starting commit. `direction` is "parents" or "children".
function walk(graph, start, direction) {
  assertKnown(graph, start);
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const sha = stack.pop();
    if (seen.has(sha)) continue;
    seen.add(sha);
    stack.push(...graph.get(sha)[direction]);
  }
  return seen;
}

/** The commit itself plus everything it can reach by following parents (what git calls "reachable"). */
export const reachable = (graph, sha) => walk(graph, sha, "parents");

/** Every earlier commit this one is built on (excludes the commit itself). */
export function ancestors(graph, sha) {
  const set = walk(graph, sha, "parents");
  set.delete(sha);
  return set;
}

/** Every later commit built on top of this one (excludes the commit itself). */
export function descendants(graph, sha) {
  const set = walk(graph, sha, "children");
  set.delete(sha);
  return set;
}

/**
 * Best common ancestors of two commits (what `git merge-base --all` returns).
 * A common ancestor is "best" if it is not an ancestor of another common ancestor.
 * Usually one commit; criss-cross merges can give two or more.
 */
export function mergeBases(graph, a, b) {
  const fromA = reachable(graph, a);
  const fromB = reachable(graph, b);
  const common = [...fromA].filter((sha) => fromB.has(sha));

  // Everything that sits below some common commit is redundant.
  const redundant = new Set();
  const stack = [];
  for (const sha of common) stack.push(...graph.get(sha).parents);
  while (stack.length) {
    const sha = stack.pop();
    if (redundant.has(sha)) continue;
    redundant.add(sha);
    stack.push(...graph.get(sha).parents);
  }
  return common.filter((sha) => !redundant.has(sha));
}

/**
 * How two branch tips have drifted apart (like `git rev-list --left-right a...b`).
 * `ahead`  = commits only reachable from a, `behind` = commits only reachable from b.
 */
export function divergence(graph, a, b) {
  const fromA = reachable(graph, a);
  const fromB = reachable(graph, b);
  const onlyA = [...fromA].filter((sha) => !fromB.has(sha));
  const onlyB = [...fromB].filter((sha) => !fromA.has(sha));
  return {
    ahead: onlyA.length,
    behind: onlyB.length,
    onlyA,
    onlyB,
    mergeBases: mergeBases(graph, a, b),
  };
}
