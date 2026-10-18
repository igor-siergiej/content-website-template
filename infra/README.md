# Infrastructure

Terraform for the static site: private **S3** bucket + **CloudFront** (Origin Access Control) + a **GitHub Actions OIDC** deploy role. No servers.

## Architecture

```mermaid
flowchart LR
    user([Visitor]):::ext

    subgraph aws["AWS"]
        cf["CloudFront distribution<br/>redirect-to-https · gzip<br/>403/404 → /404.html"]
        oac{{"Origin Access Control<br/>(SigV4 signed)"}}
        s3[("S3 bucket (private)<br/>static build<br/>public access blocked")]
        role["IAM role: gha-deploy<br/>s3 Put/Delete/List +<br/>cloudfront CreateInvalidation"]
        tfrole["IAM role: gha-terraform<br/>s3/cloudfront/iam"]
        oidc{{"IAM OIDC provider<br/>token.actions.githubusercontent.com"}}
    end

    subgraph gh["GitHub"]
        push["push to main"] --> actions["Actions: ci-cd.yml<br/>lint → test → build → deploy"]
        infrapush["push to main<br/>(infra/**)"] --> tfapply["Actions: terraform.yml apply job<br/>terraform apply"]
        pr["PR touching infra/**"] --> tfplan["Actions: terraform.yml plan job<br/>terraform plan → PR comment"]
    end

    tfstate[("S3 backend bucket<br/>terraform.tfstate<br/>native lockfile")]:::ext

    %% request path
    user -->|HTTPS| cf
    cf --> oac -->|"s3:GetObject<br/>(bucket policy: SourceArn = this dist)"| s3

    %% app deploy path
    actions -->|AssumeRoleWithWebIdentity<br/>sub=repo:…:ref:refs/heads/main| oidc
    oidc -.->|federates| role
    actions -->|"aws s3 sync"| s3
    actions -->|"create invalidation"| cf

    %% infra deploy path
    tfapply -->|AssumeRoleWithWebIdentity<br/>sub=repo:…:ref:refs/heads/main| oidc
    tfplan -->|AssumeRoleWithWebIdentity<br/>sub=repo:…:pull_request| oidc
    oidc -.->|federates| tfrole
    tfapply -->|provisions| aws
    tfapply -->|state| tfstate
    tfplan -->|state (read)| tfstate

    classDef ext fill:#f2f0ea,stroke:#c8102e,color:#141414;
```

**Request path:** visitor → CloudFront (HTTPS) → OAC-signed read from the private S3 bucket. The bucket denies all public access; its policy only allows `cloudfront.amazonaws.com` scoped to this distribution's ARN.

**Deploy path:** push to `main` → GitHub Actions builds, then assumes `gha-deploy` via GitHub OIDC (no stored AWS keys) → `s3 sync` the build and issue a CloudFront invalidation.

## Prerequisites

- Terraform >= 1.5
- AWS credentials with admin-ish rights for the initial apply (`aws configure` or `AWS_PROFILE`)

## First apply

Terraform state lives in an S3 backend (`backend.tf`) with native S3 locking — no DynamoDB
table needed. That bucket can't be created by the same Terraform config that needs it to
store its own state, so create it manually first:

```bash
aws s3 mb s3://your-project-tfstate-<account-id> --region eu-west-2
aws s3api put-bucket-versioning --bucket your-project-tfstate-<account-id> --versioning-configuration Status=Enabled
```

Then replace `CHANGEME` in `infra/backend.tf`'s `bucket` with that real bucket name, and set
the same value for `tfstate_bucket` in a `terraform.tfvars` (gitignored, `infra/*.tfvars`):

```hcl
tfstate_bucket = "your-project-tfstate-<account-id>"
```

```bash
cd infra
terraform init
terraform apply
```

## Wire up CI deploy

`terraform apply` prints four outputs. Set them as **GitHub repository variables**
(Settings → Secrets and variables → Actions → *Variables*), or:

```bash
gh variable set S3_BUCKET                 -b "$(terraform output -raw bucket_name)"
gh variable set CLOUDFRONT_DISTRIBUTION_ID -b "$(terraform output -raw distribution_id)"
gh variable set AWS_DEPLOY_ROLE_ARN       -b "$(terraform output -raw deploy_role_arn)"
gh variable set AWS_REGION                -b "$(terraform output -raw aws_region)"
gh variable set SITE_URL                  -b "https://your-domain.example"
```

Also set **`SITE_URL`**, to your real domain (or `terraform output -raw cloudfront_url` if you
haven't attached a custom domain yet). It's read at build time for every canonical URL,
OG tag, sitemap entry and RSS link — leaving it unset silently ships
`http://localhost:4321` everywhere.

After that, every push to `main` builds and deploys via `.github/workflows/ci-cd.yml`
(no long-lived AWS keys — the workflow assumes the role through OIDC).

Live URL: `terraform output -raw cloudfront_url`.

## Wire up CI-driven terraform apply

`terraform apply` also prints `terraform_role_arn`. Set it as a **GitHub repository
variable**:

```bash
gh variable set AWS_TERRAFORM_ROLE_ARN -b "$(terraform output -raw terraform_role_arn)"
```

After that, `.github/workflows/terraform.yml` handles `infra/` changes: a PR touching
that path gets a `terraform plan` posted as a PR comment; a merge to `main` runs
`terraform apply` automatically (same OIDC trust model as the app deploy, no stored AWS
keys). The `gha-terraform` role itself has to exist before CI can assume it — bootstrap
it with one local `terraform apply` first, same as `gha-deploy`.

There's no branch-protection gate on the `plan` check (GitHub Pro is required for
required-status-checks on a private repo) — treat a red `plan` job as "don't merge yet",
not as something that physically blocks the merge button.

## Notes

- Bucket is private; only CloudFront can read it (OAC + bucket policy scoped to the distribution ARN).
- Bucket versioning is enabled for rollback after a bad deploy; noncurrent versions expire after 30 days.
- Responses carry a security headers policy (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-XSS-Protection).
- Routing: a missing/mistyped path is a real 404 — CloudFront maps 403/404 → `/404.html` (response code 404), not to the homepage.
- Caching: content-hashed `_astro/*` uploaded `immutable`; `images/*` (Keystatic overwrites these in place) uploaded with a 1-hour cache; every page, `sitemap*.xml`, `rss.xml` and `robots.txt` uploaded `no-cache` — set by the deploy job in `.github/workflows/ci-cd.yml`.
- `var.domain_hidden` (default `false`) 403s the real domain while `true`, leaving only the `*.cloudfront.net` URL reachable — use it to stage a domain pre-launch, then flip to `false` (or unset) to go live.
- If the account already has a GitHub OIDC provider, set `var.existing_oidc_provider_arn`
  to its ARN so this stack reuses it instead of trying to create a second one (AWS
  allows only one per URL — re-applying without that variable against an account that
  already has one fails with `EntityAlreadyExists`). Leave it empty only in a fresh
  account so the provider gets created.
- `var.domain_name` (default `""`) toggles the whole DNS path. With it empty, this
  stack creates no `aws_route53_zone`, no Route 53 alias records, and no ACM
  certificate; CloudFront is reachable only via its default `*.cloudfront.net` URL.
  When ready to attach a real domain, set `var.domain_name` and re-apply — Route 53 is
  brought up (delegate the zone's NS records at the registrar) and a DNS-validated ACM
  certificate in `us-east-1` attaches to the distribution. Outputs:
  `terraform output -raw route53_name_servers` is `null` until the domain is set.
- `var.github_repo` defaults to `owner/__APP_NAME__`, which works for repositories
  created before 2026-07-15 that haven't opted in to immutable subjects. GitHub issues
  an immutable, ID-suffixed sub-claim (`owner@<owner-id>/repo@<repo-id>`) for any
  repository created on or after that date — a wrong value silently breaks every
  AssumeRoleWithWebIdentity call with a misleading message that never names the repo.
  See `var.github_repo` in `variables.tf` for the API call that recovers the live
  value.
- `var.enable_monitoring` (default `false`) provisions the SNS alert topic, the
  CloudWatch log group for the distribution (`/aws/cloudfront/${var.project}`), and the
  `5xx`/`4xx` rate + request-flood alarms in `monitoring.tf`. Setting it to `true`
  without setting `var.alert_email` causes the email subscription to fail; AWS emails a
  confirmation on first apply — unconfirmed subscriptions deliver nothing.
