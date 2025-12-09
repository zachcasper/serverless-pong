terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.0"
    }
  }
}

variable "context" {
  description = "Radius-provided object containing information about the resource calling the Recipe."
  type = any
}

locals {
  uniqueName = var.context.resource.name
  port       = 6379
  namespace  = var.context.runtime.kubernetes.namespace

  # Valid Kubernetes memory values
  capacity = lookup(
    {
      S = "256Mi"
      M = "512Mi"
      L = "1Gi"
    },
    upper(try(var.context.resource.properties.capacity, "M")),
    "512Mi"
  )

  # Convert to human-friendly for Redis CLI flag (e.g., 256mb)
  redis_capacity = lookup(
    {
      S = "256mb"
      M = "512mb"
      L = "1gb"
    },
    upper(try(var.context.resource.properties.capacity, "M")),
    "512mb"
  )
}

# Generate a secure random password
resource "random_password" "password" {
  length  = 16
  special = false
}


resource "kubernetes_deployment" "redis" {
  metadata {
    name      = local.uniqueName
    namespace = local.namespace
  }

  spec {
    selector {
      match_labels = {
        app = "redis"
      }
    }

    template {
      metadata {
        labels = {
          app = "redis"
        }
      }

      spec {
        container {
          name  = "redis"
          image = "redis:7-alpine"

          command = [
            "redis-server",
            "--requirepass", random_password.password.result,
            "--protected-mode", "no",
            "--maxmemory", local.redis_capacity,
            "--maxmemory-policy", "allkeys-lru"
          ]

          port {
            container_port = local.port
          }

          # ✅ Correct Kubernetes resource units
          resources {
            limits = {
              memory = local.capacity
            }
            requests = {
              memory = local.capacity
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "redis" {
  metadata {
    name      = local.uniqueName
    namespace = local.namespace
  }

  spec {
    selector = {
      app = "redis"
    }

    port {
      port        = local.port
      target_port = local.port
    }
  }
}


output "result" {
  value = {
    values = {
      host = "${kubernetes_service.redis.metadata[0].name}.${kubernetes_service.redis.metadata[0].namespace}.svc.cluster.local"
      port = kubernetes_service.redis.spec[0].port[0].port
      username = ""
    }
    secrets = {
      password = random_password.password.result
    }
    // UCP resource IDs
    resources = [
        "/planes/kubernetes/local/namespaces/${kubernetes_service.redis.metadata[0].namespace}/providers/core/Service/${kubernetes_service.redis.metadata[0].name}",
        "/planes/kubernetes/local/namespaces/${kubernetes_deployment.redis.metadata[0].namespace}/providers/apps/Deployment/${kubernetes_deployment.redis.metadata[0].name}"
    ]
  }
  description = "The result of the Recipe. Must match the target resource's schema."
  sensitive = true
}