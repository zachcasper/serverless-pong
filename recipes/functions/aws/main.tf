// -----PROVIDER CONFIGURATION----- //

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

// -----RADIUS RECIPE CONTEXT----- //

variable "context" {
  description = "Radius-provided object containing information about the resource calling the Recipe."
  type        = any
}

// -----RADIUS ENVIRONMENT CONFIGURATION----- //

variable "vpc_id" {
  description = "The ID of the VPC where the Lambda function will be deployed."
  type        = string
}

variable "security_group_id" {
  description = "The ID of the security group to associate with the Lambda function."
  type        = string
}

data "aws_subnets" "selected" {
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }
}

// -----VARIABLES----- //

locals {
  connections = try(var.context.resource.connections, {})
  connection_env_vars = flatten([
    for conn_name, conn in local.connections :
    try(conn.disableDefaultEnvVars, false)
      ? [
          for prop_name, prop_value in try(conn.status.computedValues, {}) : {
            name  = upper("CONNECTION_${conn_name}_${prop_name}")
            value = tostring(prop_value)
          }
        ]
      : []
  ])

  vpc_id = var.vpc_id

  subnet_ids = data.aws_subnets.selected.ids

  security_group_ids = [ var.security_group_id ]

  function_name = var.context.resource.name

  image = var.context.resource.properties.image

  memory_size = try(var.context.resource.properties.memorySize, null)

  timeout = try(var.context.resource.properties.timeout, null)

  architectures = try(var.context.resource.properties.architectures, ["x86_64"])

  use_image_config = try(var.context.resource.properties.useImageConfig, false)

  image_command = try(var.context.resource.properties.imageCommand, null)

  image_entry_point = try(var.context.resource.properties.imageEntryPoint, null)

  image_working_directory = try(var.context.resource.properties.imageWorkingDirectory, null)

  enable_function_url = try(var.context.resource.properties.enable_function_url, true)

  function_url_authorization_type = try(var.context.resource.properties.functionUrlAuthorizationType, "NONE")
}

# IAM role for the Lambda function with basic execution permissions.
resource "aws_iam_role" "lambda_exec" {
  name = "${local.function_name}-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        },
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_vpc_access" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_lambda_function" "container" {
  function_name = local.function_name
  role          = aws_iam_role.lambda_exec.arn
  package_type  = "Image"
  image_uri     = local.image

  architectures = local.architectures
  timeout       = local.timeout
  memory_size   = local.memory_size

  vpc_config {
    subnet_ids = local.subnet_ids
    security_group_ids = local.security_group_ids
  }

  dynamic "environment" {
    for_each = length(local.connection_env_vars) > 0 ? [1] : []
    content {
      variables = local.connection_env_vars
    }
  }

  dynamic "image_config" {
    for_each = local.use_image_config ? [1] : []
    content {
      command           = local.image_command
      entry_point       = local.image_entry_point
      working_directory = local.image_working_directory
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_iam_role_policy_attachment.lambda_vpc_access,
  ]
}

resource "aws_lambda_function_url" "default" {
  count = local.enable_function_url ? 1 : 0

  function_name      = aws_lambda_function.container.function_name
  authorization_type = local.function_url_authorization_type

  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["*"]
  }

  depends_on = [aws_lambda_function.container]
}

output "result" {
  value = {
    values = {
      function_url  = length(aws_lambda_function_url.default) > 0 ? aws_lambda_function_url.default[0].function_url : null
    }
  }
}