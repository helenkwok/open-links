import test from "node:test";
import assert from "node:assert/strict";
import { pathRefs, absolute, opener, register } from "../hooks/open-links.mjs";

test("pathRefs: absolute, home, Windows, relative and bare paths with their line; no web links or climbing out", () => {
  const t = "See src/foo.ts:42, README.md and `F:\\w\\ifc\\README.md`, ~/x/notes.md, /etc/hosts. .planning/a.md, ./b.ts:3:7 https://a.io/b.md ../up.md 3.5";
  assert.deepEqual(pathRefs(t).map((r) => [r.path, r.line ?? null]), [
    ["src/foo.ts", 42], ["README.md", null], ["F:\\w\\ifc\\README.md", null], ["~/x/notes.md", null], ["/etc/hosts", null],
    [".planning/a.md", null], ["./b.ts", 3],
  ]);
});

test("absolute: relative to the session folder, ~ to home, Windows kept with / separators", () => {
  assert.equal(absolute("src/a.ts", "/Users/h/p", "/Users/h"), "/Users/h/p/src/a.ts");
  assert.equal(absolute("./a.ts", "F:\\w\\", null), "F:/w/a.ts");
  assert.equal(absolute("~/x.md", "/p", "/Users/h"), "/Users/h/x.md");
  assert.equal(absolute("~/x.md", "/p", undefined), null);
});

test("opener: the editor at the line, else the system's opener, never a shell", () => {
  assert.deepEqual(opener("/a/b.ts", 42, "code", "mac"), ["code", "-g", "/a/b.ts:42"]);
  assert.deepEqual(opener("F:/w/a.md", null, "", "windows"), ["explorer", "F:\\w\\a.md"]);
  assert.deepEqual(opener("/a", null, "", "mac"), ["open", "/a"]);
  assert.deepEqual(opener("/a", null, "", "linux"), ["xdg-open", "/a"]);
});

test("a reply draws as written, with a line of links to paths that exist; a press opens one", async () => {
  let h; register((name, m, fn) => { h = fn; }, { editor: "code" });
  const files = new Set(["/p/src/foo.ts", "/p/README.md", "/p/.planning/x.md"]);
  const ran = [];
  const $ = {
    clock: { now: async () => 0 }, session: { cwd: async () => "/p" }, env: { get: async (n) => (n === "HOME" ? "/Users/h" : undefined) },
    fs: { stat: async (p) => (files.has(p) ? { kind: "file" } : Promise.reject(new Error("no"))) },
    ui: { resolve: () => ({ Box: (p) => ({ box: p }), Markdown: (p) => ({ md: p }) }), toast: () => {} },
    process: { run: async (argv) => (ran.push(argv), { exitCode: 0 }) },
  };
  const e = (text) => ({ surface: "terminal", props: { text } });
  const out = await h($, e("Edit src/foo.ts:42, see README.md, .planning/x.md and missing.ts"), async (x) => x);
  const md = out.box.children[1].box.children[0].md;
  assert.equal(md.text, "⎿  open: [src/foo.ts:42](file:///p/src/foo.ts#L42) · [README.md](file:///p/README.md)"); // .planning left to gsd-status-mod
  md.onLinkPress({ href: "file:///p/src/foo.ts#L42" });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(ran, [["code", "-g", "/p/src/foo.ts:42"]]);
  const plain = e("no paths here");
  assert.equal(await h($, plain, async (x) => x), plain);
  assert.equal(await h($, { ...plain, surface: "desktop", props: { text: "README.md" } }, async (x) => x).then((x) => x.surface), "desktop");
});
