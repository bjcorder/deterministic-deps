module "pinned" {
  source = "git::https://github.com/acme/module.git?ref=0123456789abcdef0123456789abcdef01234567"
}

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
