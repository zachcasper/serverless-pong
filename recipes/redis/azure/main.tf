terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 3.0, < 4.0"
    }
  }
}

module "naming" {
  source  = "Azure/naming/azurerm"
  prefix = [ var.context.application.name ]
}

variable "context" {
  description = "Context variable set by Radius which includes the Radius Application, Environment, and other Radius properties"
  type = any
}

variable "resource_group_name" {
  description = "Azure Resource group set via a parameter on the Radius Recipe"
  type = string
}

variable "location" {
  description = "Azure region set via a parameter on the Radius Recipe"
  type = string
}

resource "azurerm_redis_cache" "redis" {
  name                          = module.naming.redis_cache.name_unique
  location                      = var.location
  resource_group_name           = var.resource_group_name
  capacity                      = 0
  family                        = "C"
  sku_name                      = "Basic"
  minimum_tls_version           = "1.2"
  public_network_access_enabled = true
}

output "result" {
  value = {
    values = {
      host = azurerm_redis_cache.redis.hostname
      port = azurerm_redis_cache.redis.ssl_port
      username = ""
      tls      = true
    }
    secrets = {
      password = azurerm_redis_cache.redis.primary_access_key
    }
  }
  sensitive = true
}