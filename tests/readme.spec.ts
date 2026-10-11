import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

// The README must keep up with the code: a setting, default, version or image out of step fails here.
// String paths, not URLs: the engine's URL type is not the one node:fs takes.
const root = `${import.meta.dirname}/..`;
const read = (p: string): string => readFileSync(`${root}/${p}`, "utf8");
const readme = read("README.md");
const plugin = JSON.parse(read(".claude-plugin/plugin.json")) as { version: string; userConfig: Record<string, { default: unknown }> };

test("README: every setting, with its default", () => {
  for (const [k, v] of Object.entries(plugin.userConfig)) assert.ok(readme.includes(`| \`${k}\` |`) && readme.includes(`| \`${JSON.stringify(v.default) === '""' ? '""' : String(v.default)}\` |`), k);
});

test("README: one version in the manifest, the badge and the changelog", () => {
  assert.ok(readme.includes(`badge/version-${plugin.version}-`), "version badge");
  assert.equal(read("CHANGELOG.md").match(/^## (\d+\.\d+\.\d+) \(\d{4}-\d\d-\d\d\)$/m)?.[1], plugin.version);
});

test("README: images exist and every image in docs is used", () => {
  const used = [...readme.matchAll(/src="(docs\/[^"]+)"/g)].map((m) => m[1]);
  for (const p of used) assert.ok(existsSync(`${root}/${p}`), p);
  for (const f of readdirSync(`${root}/docs`)) if (f !== "social.png") assert.ok(used.includes(`docs/${f}`), f);
});
