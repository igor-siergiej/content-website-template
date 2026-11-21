# Content Website Template

Astro + Keystatic (Cloud storage) + Tailwind v4/shadcn scaffold for
SEO-optimised content/promo sites. Deploys to AWS (S3 + CloudFront) via
Terraform + GitHub Actions, no backend server at runtime.

Architecture: [docs/diagrams/architecture.excalidraw](docs/diagrams/architecture.excalidraw)
(open in excalidraw.com or the VS Code Excalidraw extension).

Sites scaffolded from it (per their READMEs): `taisei-karate`, `shoppingo-site`.

## Create a new site

```bash
bunx degit igor-siergiej/content-website-template my-site
cd my-site
bun run init my-site         # replaces __APP_NAME__/__APP_TITLE__ tokens, removes itself
bun install
git init && git add -A && git commit -m "chore: scaffold from content-website-template"
```

## Stack

| Concern                   | Choice                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Runtime / package manager | Bun                                                                                                     |
| Framework                 | Astro 7 (static output)                                                                                 |
| Content / CMS             | Keystatic, `storage: { kind: 'cloud' }` — admin at `/keystatic`, commits straight to GitHub, no backend |
| UI                        | React 19 islands, Tailwind v4, shadcn (radix base, nova preset)                                         |
| Lint / format             | Oxlint + Oxfmt via `@imapps/oxc-config` (including anti-slop rules)                                     |
| Hooks                     | Husky + lint-staged + commitlint (Conventional Commits)                                                 |
| Release                   | semantic-release                                                                                        |
| Dead code                 | Fallow                                                                                                  |
| CI                        | GitHub Actions (`.github/workflows`)                                                                    |
| Infra                     | Terraform (`infra/`) — S3 + CloudFront + GitHub OIDC, no servers                                        |

## Commands

Use Bun **1.4.4+** (lockfile/package manager: `bun@1.4.4`) and Node **22.22.1+**.
The Node minimum includes the existing Astro and lint-staged requirements; Oxc's
selected binaries require Node `^20.19.0 || >=22.12.0`. Install with
`bun install --frozen-lockfile`.

```bash
bun run dev            # dev server, :4321
bun run build          # static build -> dist/
bun run preview        # preview the static build
bun run lint           # read-only Oxlint (warnings fail) + Oxfmt formatting check
bun run lint:fix       # apply safe lint fixes, then format; unresolved diagnostics fail
bun run format         # apply formatting and import ordering only
bun run format:check   # read-only formatting check
bun run typecheck      # Astro checks, including .astro templates
bun run test           # vitest
bun run test:e2e       # playwright
```

### Shared tooling and coverage

`oxlint.config.mjs` and `oxfmt.config.mjs` import the published
[`@imapps/oxc-config`](https://www.npmjs.com/package/@imapps/oxc-config) `/oxlint`
and `/oxfmt` presets. Commands pass the configs explicitly because `.mjs` configs
are not auto-discovered by these releases. This keeps config loading native ESM
without changing the application's module mode.

Selected versions: shared config **7.0.1**, Oxlint and `@oxlint/plugins` **1.94.0**,
Oxfmt **0.79.0**. The published 7.0.1 package metadata declares peer ranges
`>=1.90.0 <2` for Oxlint/plugins and `>=0.75.0 <1` for Oxfmt; these versions
were selected from registry metadata, not the older exact examples in its README.
Astro formatting explicitly installs `@astrojs/compiler-rs` **0.5.2**, the same
parser release already used by the locked Astro runtime. Keep Oxlint and its
JS-plugin runtime aligned when upgrading and rerun the tooling regressions to
prove the anti-slop plugin loads.

- Oxlint checks JS/JSX/TS/TSX (including module variants). Shared correctness,
  accessibility and anti-slop rules stay enabled. Project rules retain
  `prefer-const`, `prefer-template`, one declaration per variable, and loose-equality
  warnings (warnings fail `lint`). Existing source exceptions for explicit `any`,
  unused variables and non-null assertions remain scoped to `src`; the shared
  preset also allows explicit `any` in tests. Placeholder anchors retain local,
  explained accessibility suppressions rather than disabling the rule globally.
- Oxfmt preserves four-space indentation, 120 columns, single quotes, semicolons
  and two-space JSON, with shared import sorting. Husky/lint-staged runs safe lint
  fixes then formatting on staged JS/TS and Astro, and formatting on staged
  JSON/JSONC, CSS, HTML, Markdown/MDX and YAML. CI's existing `bun run lint` now
  checks both.
- **Astro lint coverage is script-only, not template lint parity.** Oxlint 1.94
  extracts frontmatter and script blocks for JS/TS linting, including anti-slop
  rules; template expressions and markup do not receive those checks. The Astro
  override leaves unused-variable/import checks off because component references
  in markup are outside that scope. Oxfmt 0.79's bundled Astro Prettier plugin is
  explicitly enabled with `@astrojs/compiler-rs`; Astro import sorting remains
  off, preserving the previous exception. Use `bun run typecheck` and
  `bun run build` for full Astro validation as well.
- CSS is formatted, not linted by Oxlint: the old Tailwind unknown-at-rule and
  `!important` exceptions need no equivalent. HTML element-ID uniqueness and
  TypeScript suppression-comment checks from the old linter have no enabled
  equivalent in this setup; Astro/type checking is not a claim of lint parity.
  Markdoc (`.mdoc`), Terraform/HCL and images are not formatted/linted by Oxc.
- Both configs exclude generated `.astro`, `dist`, dependency, Playwright output,
  `.playwright-mcp`, factory and Terraform cache directories, alongside the shared
  agent-directory exclusions. Oxfmt also respects `.gitignore`, leaves the
  generated `bun.lock` to Bun, preserves workflow formatting, and excludes the
  factory's frozen `src/lib/tooling.test.ts` from rewriting (it is still linted).

## Post-scaffold setup

1. Create the Keystatic Cloud project (keystatic.cloud) and set
   `cloud.project` in `keystatic.config.ts` to `<team>/<project>`.
2. Fill in `src/config/site.ts` (name, url, description, social, OG image).
3. Set the `Sitemap:` line in `public/robots.txt` to your real domain.
4. Fill in `infra/variables.tf`'s `domain_name` (left blank by `init.ts`).
5. Create the GitHub repo, push, then follow `infra/README.md` to apply
   Terraform and wire up the `gha-deploy`/`gha-terraform` OIDC roles.

## Content editing

- Posts live in `src/content/posts/*.md|*.mdoc`; schema in
  `src/content.config.ts` (`title`, optional `description`, `publishDate`,
  `coverImage`) and mirrored by the `posts` collection in `keystatic.config.ts`.
- Edit via the Keystatic admin at `/keystatic`; saves commit to GitHub, which
  triggers CI/CD on `main`.
- Landing sections (Hero, Features, FAQ, Navbar, Footer, ...) are React islands
  in `src/components/sections/`; site-wide metadata in `src/config/site.ts`.

## Environment variables

| Name       | Where                         | Purpose                                                                          |
| ---------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `SITE_URL` | `.env` / GitHub repo variable | Astro `site` (canonical URLs, sitemap, RSS); defaults to `http://localhost:4321` |

Deploy uses GitHub repo variables (no secrets beyond `GITHUB_TOKEN`):
`AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`.

## Testing

- Unit: vitest, `src/lib/*.test.ts`.
- E2E: playwright, `e2e/homepage.spec.ts`, `e2e/keystatic.spec.ts`.

## CI / deploy

The tracked `jott-config.json` enables local Playwright gates and required PR
checks. This reusable template has no configured hosted deployment target, so
the factory profile declares neither deployment nor live smoke. Configure those
for a deployed project rather than using a placeholder production URL.

- `pull-request.yml`: PR checks on all branches.
- `ci-cd.yml` (push to `main`): lint, typecheck + test, build (`dist` artifact),
  then `semantic-release` and deploy in parallel. Deploy assumes the AWS role
  via OIDC, `aws s3 sync`s with per-path cache headers (hashed assets immutable,
  `images/` short cache, pages no-cache) and invalidates CloudFront.
- `terraform.yml`: plan on same-repo PRs touching `infra/**`, apply on push to
  `main`. See `infra/README.md`.

## Credits

UI skeleton adapted from
[leoMirandaa/shadcn-landing-page](https://github.com/leoMirandaa/shadcn-landing-page)
(MIT).
