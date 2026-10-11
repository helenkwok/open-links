# open-links

A Claude Code mod: file paths in Claude's replies become links. Claude Code 2.1.296 draws them as plain text
([anthropics/claude-code#79839](https://github.com/anthropics/claude-code/issues/79839)), so `src/foo.ts:42` or
`F:\work\README.md` in a reply cannot be opened.

The reply is drawn exactly as Claude wrote it. Under it, one line carries a link for each path that exists:

    ⏺ Look at hooks/panel.mjs:242 and README.md, also ~/workspace/gsd-status-mod/CHANGELOG.md, ~/nope/missing.md.
      ⎿  open: hooks/panel.mjs:242 · README.md · ~/workspace/gsd-status-mod/CHANGELOG.md

- **Paths it reads**: absolute (`/etc/hosts`), home (`~/x.md`), Windows (`F:\work\a.md`, `F:/work/a.md`), relative to the
  session folder (`src/foo.ts`, `./b.ts`), and bare file names there (`README.md`), each with an optional `:line` or
  `:line:col`. Web links, version numbers and paths that climb out with `..` are skipped.
- **Only what exists** is linked, checked once a minute at most per path. Network locations (`//host`, `/net`,
  `/Network`) are never checked.
- **A click** opens the file in its default app (`open` on macOS, `explorer` on Windows, `xdg-open` on Linux), or, with
  the `editor` option, in your editor at the line (`code -g file:42`). Clicks reach a mod in the fullscreen terminal;
  elsewhere the link is a plain `file://` hyperlink your terminal may open itself.
- **`.planning` markdown** is left to [gsd-status-mod](https://github.com/helenkwok/gsd-status-mod), which links it to
  its reader (the `skipPlanning` option).

## Settings

| Option | What it does | Default |
| --- | --- | --- |
| `editor` | Command to open files at the line (`code`, `cursor`, `windsurf`: anything that takes `-g file:line`). Empty: the default app. | `""` |
| `skipPlanning` | Skip markdown under `.planning`, which gsd-status-mod already links. | `true` |

## What it can touch

`claude plugin validate .claude-plugin/plugin.json` lists it: the `ui.render` hook for `AssistantMessage`;
`$.fs.stat` (does a path exist), `$.session.cwd`, `$.env.get` (`HOME`, `USERPROFILE`), `$.clock.now`, `$.ui.resolve`,
`$.ui.toast`, and `$.process.run` only when you click a link (the opener or your editor, by argument list, no shell).
No network, no writes.

## Install

Claude Code 2.1.287 or later:

    claude plugin marketplace add helenkwok/gsd-status-mod
    claude plugin install open-links@helenkwok-mods

The marketplace is shared with gsd-status-mod. Set the editor with `/plugin configure open-links@helenkwok-mods`.

To try it for one session without installing:

    git clone https://github.com/helenkwok/open-links ~/open-links
    claude --plugin-dir ~/open-links

## Development

TypeScript 7, loaded by Claude Code as is (no build step). Node 24 or later.

    npm ci
    npm test          # node:test on tests/*.spec.ts (Node runs the .ts directly)
    npm run lint      # oxlint
    npm run check     # tsc (TypeScript 7) and oxlint's type-aware rules

`npm run check` needs `.claude-plugin/types/`, which Claude Code writes when it loads the mod from this folder (run
`claude --plugin-dir .` once); those files are not in git, so CI runs the tests and the plain lint only. ESLint is not
used: typescript-eslint does not support TypeScript 7 yet.
