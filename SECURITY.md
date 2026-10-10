# Security policy

The player opens files people download from anywhere, and it runs mounted inside other people's pages, so a flaw in it
reaches every page built on it.

## Supported versions

The player is at 0.x. Security fixes go into the latest release only, as a patch release. Upgrade to the latest `0.x` to
receive them.

## Reporting a vulnerability

Please do not open a public issue, discussion or pull request.

Report it privately through
[GitHub's private vulnerability reporting](https://github.com/fretfall/player/security/advisories/new). Include the version,
the browser, the steps to reproduce and what an attacker gains; a tab or recording that triggers it is ideal.

## What happens next

- You hear back in the private advisory, with any questions.
- Once the problem is confirmed, the fix is made there and a disclosure date agreed with you.
- The fix ships as a patch release, and the advisory is published with it. You are credited unless you ask not to be.

## Scope

In scope is the `@fretfall/player` package: the player and its modules, the page it ships with, `mount.js` and the styles it
scopes into a host page, and the windows of a band talking to each other.

Out of scope: reading `.gp` and `.musicxml` files is [alphaTab](https://github.com/CoderLine/alphaTab)'s job, so report a flaw
in the parser to them; the same goes for jsDelivr and Google Fonts, which the player loads from. If the player hands what
they return to the page in a way that makes it worse, that is ours.
