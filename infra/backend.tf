terraform {
  backend "s3" {
    bucket       = "__APP_NAME__-tfstate-CHANGEME" # must match var.tfstate_bucket in variables.tf / terraform.tfvars
    key          = "__APP_NAME__/terraform.tfstate"
    region       = "eu-west-2"
    encrypt      = true
    use_lockfile = true # native S3 lock (Terraform >= 1.11), no DynamoDB needed
  }
}
