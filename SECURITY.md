# Security Policy

## Supported versions

Fishman follows semantic versioning. Security fixes are prioritized for the
latest release line.

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |
| < 0.1   | No        |

When a new minor or major line is released, older lines may receive critical
fixes for a limited time at maintainer discretion. Always upgrade to the latest
stable release when possible.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report privately using one of these channels:

1. **Preferred:** [GitHub Security Advisories](https://github.com/nkrider7/fishman/security/advisories/new)
2. Open a private report from the repository **Security** tab

Include as much of the following as you can:

- Description of the issue and impact
- Steps to reproduce or proof-of-concept
- Affected version / commit
- Suggested fix (optional)
- Your preferred credit name / handle

## Responsible disclosure

We ask that you:

- Give us a reasonable time to investigate and release a fix before public
  disclosure
- Avoid accessing or modifying data that is not yours
- Avoid degrading service availability (DoS) against third parties while testing
- Not demand payment as a condition of disclosure (we may still offer thanks /
  credit)

We commit to:

- Acknowledge receipt of valid reports as soon as practical
- Keep you informed of progress
- Credit you in release notes / advisory (unless you prefer anonymity)

## Expected response timeline

| Stage | Target |
|-------|--------|
| Acknowledgement | Within **7 days** |
| Initial assessment | Within **14 days** |
| Fix / advisory for confirmed issues | As soon as practical; severity-dependent |

Complex issues (especially those involving OS packaging, signing, or supply
chain) may take longer. We will communicate status updates for confirmed
reports.

## Security policy

Fishman is a **local-first desktop application**. Design goals that affect
security:

- Request data, history, cookies, and environments stay on the user’s machine
  unless explicitly exported or stored in a Git-native project folder
- Secrets in Git-native workspaces belong in `*.secret.json` / secret files that
  should remain gitignored
- Network requests are executed by the Rust backend (`reqwest`), not the
  renderer’s fetch stack
- Users may enable “ignore SSL” for local development — treat that as an
  explicit trust decision, not a default

If you discover issues related to:

- Path traversal or arbitrary file access via Tauri capabilities
- Secret leakage into logs, crash reports, or git-tracked files
- XSS / unsafe HTML preview of responses
- Dependency supply-chain compromise

…please report them through the private channel above.

## Safe harbor

We consider good-faith security research conducted according to this policy to
be authorized. We will not pursue legal action against researchers who follow
these guidelines.

## Questions

For non-sensitive security process questions, open a GitHub Discussion or an
issue labeled `question`. For anything that could expose users to risk, use the
private advisory flow.
