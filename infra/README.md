# Infrastructure

Terraform for the static site: private **S3** bucket + **CloudFront** (Origin Access Control) + a **GitHub Actions OIDC** deploy role. No servers.

## Architecture

```mermaid
flowchart LR
    user([Visitor]):::ext

    subgraph aws["AWS"]
        cf["CloudFront distribution<br/>redirect-to-https · gzip<br/>403/404 → /index.html (SPA)"]
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

```bash
cd infra
terraform init
terraform apply
```

Terraform state lives in an S3 backend (`backend.tf`) with native S3 locking — no DynamoDB table needed.

## Wire up CI deploy

`terraform apply` prints four outputs. Set them as **GitHub repository variables**
(Settings → Secrets and variables → Actions → *Variables*), or:

```bash
gh variable set S3_BUCKET                 -b "$(terraform output -raw bucket_name)"
gh variable set CLOUDFRONT_DISTRIBUTION_ID -b "$(terraform output -raw distribution_id)"
gh variable set AWS_DEPLOY_ROLE_ARN       -b "$(terraform output -raw deploy_role_arn)"
gh variable set AWS_REGION                -b "$(terraform output -raw aws_region)"
```

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
- SPA routing: CloudFront maps 403/404 → `/index.html` (200).
- Caching: hashed `assets/*` uploaded `immutable`, `index.html` uploaded `no-cache` — set by the deploy job.
- If the account already has a GitHub OIDC provider, `terraform import` it into
  `aws_iam_openid_connect_provider.github` before applying (AWS allows only one per URL).
