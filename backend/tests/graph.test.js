import { describe, it, expect } from "vitest";
import {
  buildGraph,
  reachable,
  ancestors,
  descendants,
  mergeBases,
  divergence,
  topoOrder,
  assignLanes,
} from "../src/graph/index.js";

const c = (sha, timestamp, ...parents) => ({ sha, timestamp, parents });
const sorted = (iterable) => [...iterable].sort();

// base <- a <- m
// base <- b <- m   (m is a merge commit, parents [a, b])
// m <- top
const merged = () =>
  buildGraph([
    c("base", 1),
    c("a", 2, "base"),
    c("b", 3, "base"),
    c("m", 4, "a", "b"),
    c("top", 5, "m"),
  ]);

// root <- x1 <- main1
//           x1 <- feat1 <- feat2
const forked = () =>
  buildGraph([
    c("root", 1),
    c("x1", 2, "root"),
    c("main1", 3, "x1"),
    c("feat1", 4, "x1"),
    c("feat2", 5, "feat1"),
  ]);

describe("buildGraph", () => {
  it("links parents and children", () => {
    const g = merged();
    expect(g.get("m").parents).toEqual(["a", "b"]);
    expect(sorted(g.get("base").children)).toEqual(["a", "b"]);
  });

  it("ignores duplicate commits", () => {
    const g = buildGraph([c("a", 1), c("a", 1)]);
    expect(g.size).toBe(1);
  });

  it("skips parents missing from a partial import", () => {
    const g = buildGraph([c("x", 2, "gone")]);
    expect(g.get("x").parents).toEqual([]);
    expect(g.get("x").missingParents).toBe(1);
  });
});

describe("traversal", () => {
  it("finds ancestors and reachable commits", () => {
    const g = merged();
    expect(sorted(ancestors(g, "m"))).toEqual(["a", "b", "base"]);
    expect(sorted(reachable(g, "m"))).toEqual(["a", "b", "base", "m"]);
  });

  it("finds descendants", () => {
    const g = merged();
    expect(sorted(descendants(g, "a"))).toEqual(["m", "top"]);
    expect(descendants(g, "top").size).toBe(0);
  });

  it("rejects unknown commits", () => {
    expect(() => ancestors(merged(), "nope")).toThrow("Unknown commit");
  });
});

describe("mergeBases and divergence", () => {
  it("finds the common ancestor of two diverged branches", () => {
    expect(mergeBases(forked(), "main1", "feat2")).toEqual(["x1"]);
  });

  it("returns the older commit when one branch contains the other", () => {
    expect(mergeBases(forked(), "feat1", "feat2")).toEqual(["feat1"]);
  });

  it("returns every best base for criss-cross merges", () => {
    const g = buildGraph([
      c("root", 1),
      c("a", 2, "root"),
      c("b", 3, "root"),
      c("m1", 4, "a", "b"),
      c("m2", 5, "b", "a"),
    ]);
    expect(sorted(mergeBases(g, "m1", "m2"))).toEqual(["a", "b"]);
  });

  it("counts commits unique to each side", () => {
    const d = divergence(forked(), "feat2", "main1");
    expect(d.ahead).toBe(2);
    expect(d.behind).toBe(1);
    expect(sorted(d.onlyA)).toEqual(["feat1", "feat2"]);
    expect(d.onlyB).toEqual(["main1"]);
    expect(d.mergeBases).toEqual(["x1"]);
  });
});

describe("topoOrder", () => {
  it("puts every commit before its parents, newest first", () => {
    const g = merged();
    const order = topoOrder(g);
    expect(order).toEqual(["top", "m", "b", "a", "base"]);
    for (const node of g.values()) {
      for (const p of node.parents) {
        expect(order.indexOf(node.sha)).toBeLessThan(order.indexOf(p));
      }
    }
  });

  it("throws on cycles", () => {
    const g = buildGraph([c("a", 1, "b"), c("b", 2, "a")]);
    expect(() => topoOrder(g)).toThrow("Cycle");
  });
});

describe("assignLanes", () => {
  it("keeps a linear history in one lane", () => {
    const g = buildGraph([c("1", 1), c("2", 2, "1"), c("3", 3, "2")]);
    const { lanes, laneCount } = assignLanes(g);
    expect([...lanes.values()]).toEqual([0, 0, 0]);
    expect(laneCount).toBe(1);
  });

  it("puts the merged branch in its own lane and keeps main straight", () => {
    const { lanes, laneCount } = assignLanes(merged());
    expect(Object.fromEntries(lanes)).toEqual({
      top: 0,
      m: 0,
      a: 0,
      b: 1,
      base: 0,
    });
    expect(laneCount).toBe(2);
  });

  it("gives diverged branch tips different lanes", () => {
    const { lanes } = assignLanes(forked());
    expect(lanes.get("main1")).not.toBe(lanes.get("feat2"));
    expect(lanes.get("root")).toBe(0);
  });
});
