module "floating" {
  source = "git::https://github.com/acme/module.git?ref=main"
}

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
