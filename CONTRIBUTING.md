# Contributing

Help is welcome — a bug report with a tab that reproduces it is as useful as a patch.

- **Something broken?** [Open an issue](https://github.com/fretfall/player/issues/new/choose). Say which file, which browser,
  and what you expected; attach the tab if you can share it.
- **An idea, or not sure it belongs?** Open an issue before you build it. The player stays small on purpose, and it is easier
  to say "yes, but over here" before the work than after.
- **Small and obvious?** A typo, a clear fix — just send the pull request.

Then: fork, branch off `main`, and before you push run `npm run lint && npm test && npm run build`, which is what CI runs.
Add or extend a `*.test.mjs` next to the module you touched — plain `node:assert`, no framework — and keep the diff to the
change you are making. Commit subjects read as [Conventional Commits](https://www.conventionalcommits.org) (`fix:`, `feat:`,
`docs:`, `chore:`, `refactor:`), because the release notes are written from them.

Two house rules, both enforced by CI: the player has **no runtime dependencies** and **no framework** — plain ES modules and
the platform — and **no pull request may make it slower or bigger** (the budgets are in [Develop](README.md#develop)). Match the style of the
file you are in rather than any style guide; there is no formatter, and a reformatted file makes a review impossible.

Questions, and tabs or songs you made with the player, go in [Discussions](https://github.com/fretfall/player/discussions).
Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md); a security problem is reported privately, as
[SECURITY.md](SECURITY.md) says.
