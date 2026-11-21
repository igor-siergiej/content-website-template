# Changelog

## Unreleased

### Changed

- Replaced Biome with published `@imapps/oxc-config@7.0.1` Oxlint/Oxfmt presets,
  including shared anti-slop rules. Pinned compatible Oxlint/plugin 1.94.0 and
  Oxfmt 0.79.0 from registry peer metadata; regenerated `bun.lock`.
- `bun run lint` now checks lint and formatting without writing. `lint:fix`
  applies safe lint fixes and formatting, `format` applies formatting/import
  ordering, and `format:check` checks formatting alone. Staged hooks and existing
  CI lint jobs use the same configuration.
- Retained supported project rules, source/test exceptions and generated-file
  boundaries; migrated placeholder-anchor suppressions. Applied shared formatting
  and readable-spacing fixes without changing application/framework behavior.
- Documented Node 22.22.1+ and Bun 1.4.4+, selected tool versions and coverage in
  README. Enabled Astro formatting with explicit compiler-rs 0.5.2 and preserved
  Astro import order. Oxlint checks Astro frontmatter/scripts, not template
  expressions or markup; keep using Astro typecheck/build. CSS is formatted only;
  Markdoc and Terraform/HCL remain outside Oxc coverage.
