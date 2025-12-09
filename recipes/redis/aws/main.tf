terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0"
    }
  }
}

# --- Variables ---
variable "vpc_id" {
  description = "The AWS VPC ID"
  type        = string
}

data "aws_subnets" "this" {
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }
}

data "aws_security_groups" "all_in_vpc" {
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }
}

variable "capacity" {
  description = "Cluster size: S (small), M (medium), or L (large)"
  type        = string
  default     = "S"

  validation {
    condition     = contains(["S", "M", "L"], var.capacity)
    error_message = "Capacity must be one of S, M, or L."
  }
}

variable "num_shards" {
  default = 1
}

variable "num_replicas_per_shard" {
  default = 0
}

# --- Node type mapping ---
locals {
  node_type_map = {
    S = "db.t4g.small"
    M = "db.t4g.medium"
    L = "db.t4g.large"
  }
  node_type = lookup(local.node_type_map, var.capacity, "db.t4g.small")
}

# --- Random resources ---
resource "random_id" "resource" {
  byte_length = 4
}

resource "random_password" "user_password" {
  length  = 16
  special = false
}

# --- Networking ---
resource "aws_memorydb_subnet_group" "subnet_group" {
  name       = "memdb-subnets-${random_id.resource.hex}"
  subnet_ids = data.aws_subnets.this.ids
  tags = { user = "zachcasper" }
}

# --- MemoryDB User and ACL ---
resource "aws_memorydb_user" "redis_user" {
  user_name     = "appuser-${random_id.resource.hex}"
  access_string = "on ~* +@all"

  authentication_mode {
    type      = "password"
    passwords = [random_password.user_password.result]
  }

  tags = { user = "zachcasper" }
}

resource "aws_memorydb_acl" "redis_acl" {
  name       = "acl-${random_id.resource.hex}"
  user_names = [aws_memorydb_user.redis_user.user_name]
  tags       = { user = "zachcasper" }
}

# --- MemoryDB Cluster ---
resource "aws_memorydb_cluster" "memorydb_cluster" {
  name                   = "memdb-${random_id.resource.hex}"
  node_type              = local.node_type
  num_shards             = var.num_shards
  num_replicas_per_shard = var.num_replicas_per_shard
  acl_name               = aws_memorydb_acl.redis_acl.name
  subnet_group_name      = aws_memorydb_subnet_group.subnet_group.name
  security_group_ids     = data.aws_security_groups.all_in_vpc.ids
  tags                   = { user = "zachcasper" }
}

# --- Outputs ---


output "result" {
  value = {
    values = {
      host = aws_memorydb_cluster.memorydb_cluster.cluster_endpoint[0].address
      port = aws_memorydb_cluster.memorydb_cluster.cluster_endpoint[0].port
      username = aws_memorydb_user.redis_user.user_name
      tls      = true
    }
    secrets = {
      password = random_password.user_password.result
    }
  }
  sensitive = true
}