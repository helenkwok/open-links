# Changelog

## 0.2.0 (2026-10-13)

- Relative paths outside the session folder: a path Claude wrote relative to where its tools were working
  (`runs/spike019/a.png` with the session started elsewhere) is found under the folders named in this session's tool
  calls and replies. Earlier tool calls are read back once from the conversation, so a resumed session has them. Linked
  only when exactly one folder holds the file.
- New `roots` setting: extra folders to resolve relative paths against, separated by `;`.
- TypeScript 7 and oxlint; a README check.

## 0.1.0 (2026-10-11)

- A line of links under each reply that names existing files: absolute, `~`, Windows, relative and bare paths, with
  `:line`. A click opens the default app, or the `editor` option at the line. `.planning` markdown is left to
  gsd-status-mod.
