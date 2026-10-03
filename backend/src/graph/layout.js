// Small binary heap; `cmp(x, y) < 0` means x comes out first.
class Heap {
  constructor(cmp) {
    this.items = [];
    this.cmp = cmp;
  }
  get size() {
    return this.items.length;
  }
  push(x) {
    const a = this.items;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Topological order, newest first: every commit appears before its parents.
 * Kahn's algorithm starting from the branch tips; ties go to the newest timestamp.
 * Throws if the data contains a cycle (a real Git history never does).
 */
export function topoOrder(graph) {
  const waiting = new Map(); // sha -> children not yet emitted
  const ready = new Heap(
    (x, y) =>
      graph.get(y).timestamp - graph.get(x).timestamp || (x < y ? -1 : 1)
  );

  for (const node of graph.values()) {
    waiting.set(node.sha, node.children.length);
    if (node.children.length === 0) ready.push(node.sha);
  }

  const order = [];
  while (ready.size) {
    const sha = ready.pop();
    order.push(sha);
    for (const p of graph.get(sha).parents) {
      const left = waiting.get(p) - 1;
      waiting.set(p, left);
      if (left === 0) ready.push(p);
    }
  }
  if (order.length !== graph.size) {
    throw new Error("Cycle detected: not a valid commit graph");
  }
  return order;
}

/**
 * Assigns each commit a lane (a vertical track) for drawing the graph.
 * Walks newest to oldest keeping one "slot" per lane that remembers which
 * commit that lane is waiting for next. The first parent stays in the same
 * lane, so the main line of history stays straight.
 * Returns { lanes: Map<sha, laneIndex>, laneCount }.
 */
export function assignLanes(graph, order = topoOrder(graph)) {
  const lanes = new Map();
  const slots = [];
  const freeSlot = () => {
    const i = slots.indexOf(null);
    return i === -1 ? slots.length : i;
  };

  for (const sha of order) {
    let lane = slots.indexOf(sha);
    if (lane === -1) lane = freeSlot();

    // Other lanes that were waiting for this commit end here (branches joining).
    for (let i = 0; i < slots.length; i++) {
      if (i !== lane && slots[i] === sha) slots[i] = null;
    }
    lanes.set(sha, lane);
    slots[lane] = null;

    graph.get(sha).parents.forEach((parent, i) => {
      const existing = slots.indexOf(parent);
      if (i === 0) {
        if (existing === -1) {
          slots[lane] = parent;
        } else if (existing > lane) {
          // Pull the line over to the lower lane so the main line stays left.
          slots[lane] = parent;
          slots[existing] = null;
        }
        // existing < lane: the parent already has a lower lane, so this lane frees up.
      } else if (existing === -1) {
        slots[freeSlot()] = parent;
      }
    });
  }

  let laneCount = 0;
  for (const lane of lanes.values()) laneCount = Math.max(laneCount, lane + 1);
  return { lanes, laneCount };
}
