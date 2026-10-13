import test from "node:test";
import assert from "node:assert/strict";
import { pathRefs, absolute, opener, register } from "../hooks/open-links.ts";

test("pathRefs: absolute, home, Windows, relative and bare paths with their line; no web links or climbing out", () => {
  const t = "See src/foo.ts:42, README.md and `F:\\w\\ifc\\README.md`, ~/x/notes.md, /etc/hosts. .planning/a.md, ./b.ts:3:7 https://a.io/b.md ../up.md 3.5";
  assert.deepEqual(pathRefs(t).map((r) => [r.path, r.line ?? null]), [
    ["src/foo.ts", 42], ["README.md", null], ["F:\\w\\ifc\\README.md", null], ["~/x/notes.md", null], ["/etc/hosts", null],
    [".planning/a.md", null], ["./b.ts", 3],
  ]);
});

test("absolute: relative to the session folder, ~ to home, Windows kept with / separators", () => {
  assert.equal(absolute("src/a.ts", "/Users/h/p", "/Users/h"), "/Users/h/p/src/a.ts");
  assert.equal(absolute("./a.ts", "F:\\w\\", undefined), "F:/w/a.ts");
  assert.equal(absolute("~/x.md", "/p", "/Users/h"), "/Users/h/x.md");
  assert.equal(absolute("~/x.md", "/p", undefined), null);
});

test("opener: the editor at the line, else the system's opener, never a shell", () => {
  assert.deepEqual(opener("/a/b.ts", 42, "code", "mac"), ["code", "-g", "/a/b.ts:42"]);
  assert.deepEqual(opener("F:/w/a.md", undefined, "", "windows"), ["explorer", "F:\\w\\a.md"]);
  assert.deepEqual(opener("/a", undefined, "", "mac"), ["open", "/a"]);
  assert.deepEqual(opener("/a", undefined, "", "linux"), ["xdg-open", "/a"]);
});

test("a reply draws as written, with a line of links to paths that exist; a press opens one", async () => {
  type Hook = (...a: any[]) => Promise<any>;
  let h: Hook = async () => undefined;
  register(((_n: string, _m: unknown, fn: Hook) => { h = fn; }) as never, { editor: "code" });
  const files = new Set(["/p/src/foo.ts", "/p/README.md", "/p/.planning/x.md"]);
  const ran: string[][] = [];
  const $ = {
    clock: { now: async () => 0 }, session: { cwd: async () => "/p" }, env: { get: async (n: string) => (n === "HOME" ? "/Users/h" : undefined) },
    fs: { stat: async (p: string) => (files.has(p) ? { kind: "file" } : Promise.reject(new Error("no"))) },
    ui: { resolve: () => ({ Box: (p: unknown) => ({ box: p }), Markdown: (p: unknown) => ({ md: p }) }), toast: () => {} },
    process: { run: async (argv: string[]) => (ran.push(argv), { exitCode: 0 }) },
  };
  const e = (text: string) => ({ surface: "terminal", props: { text } });
  const out = await h($, e("Edit src/foo.ts:42, see README.md, .planning/x.md and missing.ts"), async (x: unknown) => x);
  const md = out.box.children[1].box.children[0].md;
  assert.equal(md.text, "⎿  open: [src/foo.ts:42](file:///p/src/foo.ts#L42) · [README.md](file:///p/README.md)"); // .planning left to gsd-status-mod
  md.onLinkPress({ href: "file:///p/src/foo.ts#L42" });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(ran, [["code", "-g", "/p/src/foo.ts:42"]]);
  const plain = e("no paths here");
  assert.equal(await h($, plain, async (x: unknown) => x), plain);
  assert.equal(await h($, { ...plain, surface: "desktop", props: { text: "README.md" } }, async (x: unknown) => x).then((x) => x.surface), "desktop");
});

import { pathsIn, candidates } from "../hooks/open-links.ts";

test("pathsIn: absolute, home and Windows paths in a command or reply; not URLs or relative words", () => {
  assert.deepEqual(pathsIn("cd /Users/h/.tf/data/estate01a && python x.py --out ~/runs/a.png F:\\w\\b.md https://e.com/c/d src/e.ts", "/Users/h"),
    ["/Users/h/.tf/data/estate01a", "/Users/h/runs/a.png", "F:/w/b.md"]);
});

test("candidates: a relative path under the folder a known path passes through, a bare name beside it, roots first", () => {
  const known = ["/d/estate01a/runs/spike018/loop1/x.json"];
  assert.deepEqual(candidates("runs/spike019/a.png", known, []), ["/d/estate01a/runs/spike019/a.png"]);
  assert.deepEqual(candidates("a.png", known, ["/r"]), ["/r/a.png", "/d/estate01a/runs/spike018/loop1/a.png", "/d/estate01a/runs/spike018/loop1/x.json/a.png"]);
  assert.deepEqual(candidates("runs/a.png", ["/d/truns/x"], []), []); // a folder whose name only ends the same is no match
});

test("a relative path outside the session folder resolves through the folders its tools worked in, read back on resume", async () => {
  type Hook = (...a: any[]) => Promise<any>;
  const hooks: Record<string, Hook> = {};
  // a fresh copy of the module: what it learned and read back belongs to one load, like a session
  const fresh = (await import(`../hooks/open-links.ts?copy=${Date.now()}`)) as typeof import("../hooks/open-links.ts");
  fresh.register(((n: string, _m: unknown, fn?: Hook) => { hooks[n] = (fn ?? _m) as Hook; }) as never, { roots: "" });
  const files = new Set(["/data/estate01a/runs/spike019/loop1/k.png", "/other/runs/spike019/loop1/twin.png", "/data/estate01a/runs/spike019/loop1/twin.png"]);
  let history: unknown[] = [];
  const $ = {
    clock: { now: async () => 0 }, session: { cwd: async () => "/proj", messages: async () => history },
    env: { get: async (n: string) => (n === "HOME" ? "/Users/h" : undefined) },
    fs: { stat: async (p: string) => (files.has(p) ? { kind: "file" } : Promise.reject(new Error("no"))) },
    ui: { resolve: () => ({ Box: (p: unknown) => ({ box: p }), Markdown: (p: unknown) => ({ md: p }) }), toast: () => {} },
    process: { run: async () => ({ exitCode: 0 }) },
  };
  const draw = async (text: string) => (await hooks["ui.render"]!($, { surface: "terminal", props: { text } }, async (x: unknown) => x)) as any;
  history = [{ role: "assistant", content: [{ type: "tool_use", input: { command: "ls /data/estate01a/runs/spike018" } }] }]; // an earlier turn, before this load
  const out = await draw("The image is runs/spike019/loop1/k.png.");
  assert.match(out.box.children[1].box.children[0].md.text, /\[runs\/spike019\/loop1\/k\.png\]\(file:\/\/\/data\/estate01a\/runs\/spike019\/loop1\/k\.png\)/);
  await hooks["tool.call"]!($, { tool: "Bash", command: "cat /other/runs/spike019/notes.txt" }, async (x: unknown) => x); // now two folders have runs/
  const twin = await draw("See runs/spike019/loop1/twin.png.");
  assert.equal(twin.props.text, "See runs/spike019/loop1/twin.png."); // both have it: no guess, no link
});

test("roots: a relative path found under a configured folder; ~ expanded", async () => {
  type Hook = (...a: any[]) => Promise<any>;
  const hooks: Record<string, Hook> = {};
  const fresh = (await import(`../hooks/open-links.ts?roots=${Date.now()}`)) as typeof import("../hooks/open-links.ts");
  fresh.register(((n: string, _m: unknown, fn?: Hook) => { hooks[n] = (fn ?? _m) as Hook; }) as never, { roots: "~/.tf/estate01a; /nowhere" });
  const $ = {
    clock: { now: async () => 0 }, session: { cwd: async () => "/proj", messages: async () => [] },
    env: { get: async (n: string) => (n === "HOME" ? "/Users/h" : undefined) },
    fs: { stat: async (p: string) => (p === "/Users/h/.tf/estate01a/runs/a.png" ? { kind: "file" } : Promise.reject(new Error("no"))) },
    ui: { resolve: () => ({ Box: (p: unknown) => ({ box: p }), Markdown: (p: unknown) => ({ md: p }) }), toast: () => {} },
    process: { run: async () => ({ exitCode: 0 }) },
  };
  const out = (await hooks["ui.render"]!($, { surface: "terminal", props: { text: "Saved runs/a.png." } }, async (x: unknown) => x)) as any;
  assert.match(out.box.children[1].box.children[0].md.text, /file:\/\/\/Users\/h\/\.tf\/estate01a\/runs\/a\.png/);
});
