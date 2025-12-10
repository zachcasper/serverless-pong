# 🎮 Serverless Pong

A multiplayer Pong game built to demonstrate serverless architecture patterns across multiple platforms. The game uses Redis for session state management and can be deployed to AWS Lambda, Azure Functions, or Kubernetes using Radius.

## 🏗️ Architecture

This project demonstrates a truly portable serverless application:

- **State Management**: Redis for distributed session storage
- **Application Logic**: Platform-agnostic JavaScript (Node.js)
- **Deployment Options**:
  - Kubernetes (via Radius)
  - AWS Lambda (container image)
  - Azure Functions (container image)
  - Local development server

## 📁 Project Structure

```text
pong/
├── bicepconfig.json          # Bicep configuration
├── pong.bicep                # Radius deployment definition
├── setup.sh                  # Quick setup script
├── pong/                     # Application source
│   ├── Dockerfile.local      # Local/Kubernetes container
│   ├── Dockerfile.lambda     # AWS Lambda container
│   ├── Dockerfile.azure      # Azure Functions container
│   ├── package.json
│   └── src/
│       ├── pong.js           # Core game logic
│       ├── local.js          # Express server adapter
│       ├── lambda.js         # AWS Lambda adapter
│       └── azure.js          # Azure Functions adapter
├── recipes/                  # Radius recipes
│   └── functions/
│       ├── kubernetes/       # Kubernetes recipe
│       ├── aws/              # AWS Lambda recipe
│       └── azure/            # Azure Functions recipe
└── types/
    └── functions.yaml        # Radius function type definition
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker
- Redis (or use Docker to run Redis locally)

### Local Development

1. **Run the setup script**:

   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

2. **Start the development server**:

   ```bash
   cd pong
   npm run dev
   ```

3. **Open the game**:
   - Go to `http://localhost:3000`
   - Open in two browser windows to play multiplayer
   - Each player gets their own paddle (left or right)

### Environment Variables

The application uses the following Redis connection environment variables:

- `CONNECTION_REDIS_HOST` - Redis server hostname (default: localhost)
- `CONNECTION_REDIS_PORT` - Redis server port (default: 6379)
- `CONNECTION_REDIS_USERNAME` - Redis username (optional)
- `CONNECTION_REDIS_PASSWORD` - Redis password (optional)
- `CONNECTION_REDIS_TLS` - Enable TLS connection (boolean: 'true' or 'false')

When deployed via Radius, these are automatically injected from the Redis connection.

## 🐳 Container Images

Build platform-specific container images:

```bash
cd pong

# Build for local/Kubernetes deployment
npm run build:local

# Build for AWS Lambda
npm run build:lambda

# Build for Azure Functions
npm run build:azure

# Build all images
npm run build:all
```

Image tags:

- `pong-local:latest` - Local/Kubernetes deployment
- `pong-lambda:latest` - AWS Lambda deployment
- `pong-azure:latest` - Azure Functions deployment

## ☸️ Kubernetes Deployment with Radius

### Prerequisites

- [Radius CLI](https://docs.radapp.io/getting-started/) installed
- kubectl configured for your cluster
- kind (for local Kubernetes cluster)

### Deploy to AWS Lambda

1. **Create a kind cluster** (if testing locally):

   ```bash
   kind create cluster --name pong
   ```

1. **Initialize Radius**:

   ```bash
   rad install kubernetes 
   rad workspace create kubernetes aws
   rad group create aws
   rad group switch aws
   rad environment create aws
   rad environment switch aws

1. **Configure AWS Environment**:

   ```bash
   AWS_REGION=<region>
   AWS_ACCOUNTID=<account-id>
   AWS_ACCESS_KEY_ID=<access-key-id>
   AWS_SECRET_ACCESS_KEY=<access-key>
   rad environment update aws --aws-region $AWS_REGION --aws-account-id $AWS_ACCOUNTID
   rad credential register aws access-key --access-key-id $AWS_ACCESS_KEY_ID --secret-access-key $AWS_SECRET_ACCESS_KEY
   ```

1. **Configure Resource Types and Recipes**:

   ```bash
   rad resource-type create -f types/redisCaches.yaml
   rad resource-type create -f types/functions.yaml 
   rad bicep publish-extension --from-file types/functions.yaml --target functions.tgz
   rad bicep publish-extension --from-file types/redisCaches.yaml --target redisCaches.tgz
   rad recipe register  default \
     --resource-type Radius.Compute/functions \
     --template-kind terraform \
     --template-path git::https://github.com/zachcasper/serverless-pong.git//recipes/functions/aws  \
     --parameters vpc_id=<vpc-id> \
     --parameters security_group_id=<security-group-id>
   rad recipe register  default \
     --resource-type Radius.Data/redisCaches \
     --template-kind terraform \
     --template-path git::https://github.com/zachcasper/serverless-pong.git//recipes/redis/aws \
     --parameters vpc_id=<vpc-id>
   ```

1. **Push the container image to ECR**:

  First, ensure you have a ECR repository created for pong. Then:

   ```bash
   docker tag  pong-lambda:latest <account-id>.dkr.ecr.us-east-2.amazonaws.com/pong:latest
   docker push 817312594854.dkr.ecr.us-east-2.amazonaws.com/pong:latest
   ```

1. **Deploy the application**:

   ```bash
   rad deploy app.bicep
   ```

1. **Access the application**:

   ```bash
   kubectl port-forward svc/pong -n aws-pong 3000:3000
   ```

   Then open `http://localhost:3000`

### What Gets Deployed

The Radius deployment creates:
- A pong function (managed by Radius)
- A Redis cache (managed by Radius)
- Automatic connection injection (Redis URL via secret)
- Kubernetes Service and Deployment resources

## 🔧 Development

### File Descriptions

- **`pong/src/pong.js`**: Core game logic with Redis session management. Platform-agnostic.
- **`pong/src/local.js`**: Express.js wrapper for local development and Kubernetes
- **`pong/src/lambda.js`**: AWS Lambda handler
- **`pong/src/azure.js`**: Azure Functions handler
- **`pong.bicep`**: Radius application definition using `Radius.Compute/functions` and `Radius.Data/redisCaches`
- **`recipes/functions/`**: Terraform recipes for AWS Lambda, Azure Functions, and Kubernetes deployments

### Redis Connection

The application in `pong/src/pong.js` uses individual connection properties (`CONNECTION_REDIS_HOST`, `CONNECTION_REDIS_PORT`, etc.) rather than a single URL. This provides flexibility for different deployment scenarios and allows explicit TLS configuration via the `CONNECTION_REDIS_TLS` environment variable.

## 🎮 How to Play

1. Open the game URL in two browser windows
2. The first player controls the left paddle (player 1)
3. The second player controls the right paddle (player 2)
4. Click "Start Game" to begin the countdown
5. Move your paddle with your mouse
6. First to 5 points wins!

## 🔍 Troubleshooting

If the game does not start, or the start button is not appearing in the player window, the application cannot connect to the Redis cluster. Examine the logs and ensure the environment variables are set correctly by Radius. Ensure the TLS boolean is correct.
