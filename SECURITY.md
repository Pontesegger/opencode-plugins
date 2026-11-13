# Security and release review

## Dependency audit at preparation time

On 2026-11-13, `npm audit --omit=dev` reported **26 moderate findings**, no high
or critical findings, for this lockfile. These include dependency-chain findings
propagated through `@opencode/plugin`, `@opencode/util`, and `@opentui/solid`;
this count is not 26 distinct flaws in these two plugins.

The underlying reported advisories include:

- [Glob cancellation bypass / filesystem traversal after timeout](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)
- [Minimatch globparts amplification denial of service](https://github.com/advisories/GHSA-g3hv-75wg-m249)

Some findings have no compatible automatic fix in the current dependency tree.
In particular, npm's suggested renderer downgrade is not a suitable automatic
fix for plugins prepared against the current OpenCode/OpenTUI API. No forced
updates, downgrades, or transitive overrides have been applied.

Before public distribution:

1. Rerun `npm audit` and review current upstream advisories and fixed releases.
2. Assess whether affected code paths are reachable in the intended environment;
   this preparation does not establish exploitability or non-exploitability.
3. If updating the SDK or renderer, test both plugins against the target OpenCode
   release, including installed tarballs and the rendered interaction test.

## Private context

Context Inspector can display private system instructions, tool schemas, and
loaded skill text. Keep captures, logs, configuration credentials, and terminal
screenshots out of commits, public issues, and releases. Reproduction reports
should use synthetic data. Report suspected security issues privately to the
repository owner rather than attaching private context to a public issue.
