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

| Concern | Choice |
|---------|--------|
| Runtime / package manager | Bun |
| Framework | Astro 7 (static output) |
| Content / CMS | Keystatic, `storage: { kind: 'cloud' }` — admin at `/keystatic`, commits straight to GitHub, no backend |
| UI | React 19 islands, Tailwind v4, shadcn (radix base, nova preset) |
| Lint / format | Biome |
| Hooks | Husky + lint-staged + commitlint (Conventional Commits) |
| Release | semantic-release |
| Dead code | Fallow |
| CI | GitHub Actions (`.github/workflows`) |
| Infra | Terraform (`infra/`) — S3 + CloudFront + GitHub OIDC, no servers |

## Commands

```bash
bun run dev            # dev server, :4321
bun run build          # static build -> dist/
bun run preview        # preview the static build
bun run lint           # biome check
bun run test           # vitest
bun run test:e2e       # playwright
```

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

| Name | Where | Purpose |
|------|-------|---------|
| `SITE_URL` | `.env` / GitHub repo variable | Astro `site` (canonical URLs, sitemap, RSS); defaults to `http://localhost:4321` |

Deploy uses GitHub repo variables (no secrets beyond `GITHUB_TOKEN`):
`AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`.

## Testing

- Unit: vitest, `src/lib/*.test.ts`.
- E2E: playwright, `e2e/homepage.spec.ts`, `e2e/keystatic.spec.ts`.

## CI / deploy

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
