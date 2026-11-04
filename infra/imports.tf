# The gha-terraform role is the one CI assumes to run this config, so it has to exist
# before CI can apply anything. For this repository it was bootstrapped by hand (aws
# CLI) rather than by a local `terraform apply`, which left it outside state: the first
# CI apply then tried to CreateRole and failed with EntityAlreadyExists. This adopts the
# existing role into state instead.
#
# Once an apply has run with this block, the role is in state and the import is a no-op.
# If you bootstrap with a local `terraform apply` instead (as infra/README.md describes),
# delete this file before that first apply: Terraform refuses to import a role that
# doesn't exist yet.
import {
  to = aws_iam_role.terraform
  id = "${var.project}-gha-terraform"
}
