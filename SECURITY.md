# Security

Little Code People shows what your Claude Code sessions say and do, so its security model matters.
README.md ("Security and privacy") and hosting/README.md describe it in full. In short:
- The bridge listens on `127.0.0.1` only, is read-only, and needs the access key for every
  connection. Browser origins must be on an exact allow-list. The Host header must be local.
- The page renders session text as text, never as HTML, under a strict Content Security Policy.
- A hosted copy contacts a visitor's computer only after they opened it with their own key.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on
this repository. Do not open a public issue. Include the steps to reproduce and the impact you see.
You will get an answer as soon as possible. This is a hobby project, so there is no bounty.

## Supported versions

Only the latest version on `main` gets fixes.
