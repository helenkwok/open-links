import type { EngineInterface, PressedLink, Register } from "claude-code";

// open-links: file paths in Claude's replies become links. Claude Code 2.1.296 draws them as plain text
// (anthropics/claude-code#79839), so `src/foo.ts:42` or `F:\work\README.md` cannot be opened from the transcript.
// The reply is drawn as written; a line under it carries one link per path that exists.

// Path-like words in a reply, as written, with their line number when one follows. Web links are skipped.
export type PathRef = { text: string; path: string; line?: number };
export function pathRefs(reply: string | undefined): PathRef[] {
  const out = new Map<string, PathRef>();
  const words = (reply ?? "").replace(/[a-z][a-z0-9+.-]*:\/\/\S*/gi, " ").match(/[\w.~@+\\/:-]+/g) ?? [];
  for (let w of words) {
    w = w.replace(/^:+/, "").replace(/[.,;:]+$/, "");
    const m = /^(.+?)(?::(\d+)(?::\d+)?)?$/.exec(w);
    if (!m) continue;
    const path = m[1] ?? "", line = m[2];
    const abs = /^([A-Za-z]:[\\/]|\/|~[\\/])/.test(path);
    const dotted = /[\w-]\.[A-Za-z0-9]{1,8}$/.test(path); // ends in a file extension
    const slashed = /[\\/]/.test(path);
    if (!(abs || (slashed && (dotted || path.endsWith("/"))) || (dotted && /[A-Za-z]/.test(path.split(".")[0] ?? "")))) continue;
    if (/^\d+(\.\d+)+$/.test(path) || path.includes("..")) continue; // a version number; a path that climbs out
    if (!out.has(w)) out.set(w, { text: w, path, ...(line ? { line: Number(line) } : {}) });
  }
  return [...out.values()];
}

// A path as written -> absolute, with "/" separators. home and cwd are absolute.
export function absolute(path: string, cwd: string, home: string | undefined): string | null {
  const p = path.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(p) || p.startsWith("/")) return p;
  if (p.startsWith("~/")) return home ? `${home.replace(/\\/g, "/")}/${p.slice(2)}` : null;
  return `${cwd.replace(/\\/g, "/").replace(/\/$/, "")}/${p.replace(/^\.\//, "")}`;
}

// ponytail: places whose lookup can reach another machine are never checked (automounts, shares); add more when one bites.
const remote = (abs: string): boolean => /^\/\/|^\/(net|Network)\//.test(abs);

// The command that opens it: the editor at the line when one is set, else the system's own opener (no shell).
export type Os = "windows" | "mac" | "linux";
export function opener(abs: string, line: number | undefined, editor: string, os: Os): string[] {
  const native = os === "windows" ? abs.replace(/\//g, "\\") : abs;
  if (editor) return line ? [editor, "-g", `${native}:${line}`] : [editor, native];
  return os === "windows" ? ["explorer", native] : [os === "mac" ? "open" : "xdg-open", native];
}

const href = (abs: string): string => "file://" + (abs.startsWith("/") ? "" : "/") + encodeURI(abs).replace(/[#?()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const seen = new Map<string, { ok: boolean; at: number }>(); // abs -> exists, for a minute: a reply is drawn again on every scroll
async function exists($: EngineInterface, abs: string): Promise<boolean> {
  const now = await $.clock.now(), hit = seen.get(abs);
  if (hit && now - hit.at < 60000) return hit.ok;
  const ok = (await $.fs.stat(abs).catch(() => null)) != null;
  seen.set(abs, { ok, at: now });
  if (seen.size > 2000) seen.clear();
  return ok;
}

export const register: Register = (on, options) => {
  const editor = String(options?.editor ?? "").trim();
  const skipPlanning = options?.skipPlanning !== false;

  on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
    if (e.surface !== "terminal") return next(e);
    const refs = pathRefs(e.props?.text);
    if (!refs.length) return next(e);
    const cwd = await $.session.cwd();
    const home = (await $.env.get("HOME")) ?? (await $.env.get("USERPROFILE"));
    const found: (PathRef & { abs: string; href: string })[] = [];
    for (const r of refs.slice(0, 24)) {
      const abs = absolute(r.path, cwd, home);
      if (!abs || remote(abs) || found.some((f) => f.abs === abs && f.line === r.line)) continue;
      if (skipPlanning && /(^|\/)\.planning\/.*\.md$/i.test(abs)) continue;
      if (await exists($, abs)) found.push({ ...r, abs, href: href(abs) + (r.line ? `#L${r.line}` : "") });
      if (found.length >= 12) break;
    }
    if (!found.length) return next(e);
    // ponytail: the OS read off the paths (a drive letter, a /Users home); a $ call that names it would be better
    const os: Os = /^[A-Za-z]:/.test(cwd) ? "windows" : String(home).startsWith("/Users/") ? "mac" : "linux";
    const label = (t: string): string => t.replace(/([\\`*_[\]<>])/g, "\\$1");
    const text = `⎿  open: ${found.map((f) => `[${label(f.text)}](${f.href})`).join(" · ")}`;
    const { Box, Markdown } = $.ui.resolve(e);
    const press = async (link: PressedLink): Promise<void> => {
      const f = found.find((x) => x.href === link.href);
      if (!f) return;
      const argv = opener(f.abs, f.line, editor, os);
      const r = await $.process.run(argv, { timeoutMs: 15000 }).catch((err) => ({ exitCode: -1, stderr: String(err) }));
      // explorer exits 1 even when it opened the file, so only a failure to start counts there
      if (r.exitCode !== 0 && !(os === "windows" && !editor && r.exitCode === 1)) $.ui.toast(`open-links: could not open ${f.text} (${argv[0]})`);
    };
    return Box({ flexDirection: "column", children: [
      await next(e),
      Box({ paddingLeft: 2, children: [Markdown({ key: "open-links", dimColor: true, text, pressableLinks: found.map((f) => f.href), onLinkPress: (l) => void press(l) })] }),
    ] });
  });
};
