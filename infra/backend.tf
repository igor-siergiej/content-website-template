terraform {
  backend "s3" {
    bucket       = "karate-promo-tfstate-777799876926"
    key          = "karate-promo/terraform.tfstate"
    region       = "eu-west-2"
    encrypt      = true
    use_lockfile = true # native S3 lock (Terraform >= 1.11), no DynamoDB needed
  }
}
