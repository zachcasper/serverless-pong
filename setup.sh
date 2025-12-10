#!/bin/bash

# Serverless Pong Setup Script
# Sets up local development environment for the Pong game

echo "🎮 Setting up Serverless Pong for local development..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

echo "✓ Node.js version: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi

echo "✓ npm version: $(npm --version)"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker is not installed. Container builds will not work."
    echo "   Install Docker from: https://www.docker.com/get-started"
else
    echo "✓ Docker version: $(docker --version)"
fi

# Check if Radius is installed (optional but recommended)
if ! command -v rad &> /dev/null; then
    echo "⚠️  Radius CLI is not installed. Kubernetes deployment will not work."
    echo "   Install from: https://docs.radapp.io/getting-started/"
else
    echo "✓ Radius version: $(rad version --client 2>/dev/null || echo 'installed')"
fi

# Check if kubectl is installed (optional but recommended)
if ! command -v kubectl &> /dev/null; then
    echo "⚠️  kubectl is not installed. Kubernetes deployment will not work."
    echo "   Install from: https://kubernetes.io/docs/tasks/tools/"
else
    echo "✓ kubectl version: $(kubectl version --client --short 2>/dev/null || kubectl version --client 2>/dev/null | head -n1)"
fi

echo ""

# Navigate to pong directory
cd pong || { echo "❌ pong directory not found"; exit 1; }

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✓ Dependencies installed"

# Start Redis if Docker is available
if command -v docker &> /dev/null; then
    echo ""
    echo "🔧 Checking Redis..."
    
    # Check if Redis container exists
    if docker ps -a --format '{{.Names}}' | grep -q '^redis$'; then
        # Container exists, check if it's running
        if docker ps --format '{{.Names}}' | grep -q '^redis$'; then
            echo "✓ Redis already running on localhost:6379"
        else
            echo "Starting existing Redis container..."
            docker start redis > /dev/null 2>&1
            echo "✓ Redis started on localhost:6379"
        fi
    else
        # Create and start new Redis container
        echo "Creating Redis container..."
        docker run -d --name redis -p 6379:6379 redis:latest > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo "✓ Redis started on localhost:6379"
        else
            echo "❌ Failed to start Redis container"
            exit 1
        fi
    fi
fi

cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎮 Quick Start Options:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  Run locally with Node.js:"
echo "   cd pong && npm run dev"
echo "   → http://localhost:3000"
echo ""
echo "2️⃣  Build container images:"
echo "   cd pong"
echo "   npm run build:local   # For Kubernetes deployment"
echo "   npm run build:lambda  # For AWS Lambda"
echo "   npm run build:azure   # For Azure Functions"
echo "   npm run build:all     # Build all images"
echo ""
echo "3️⃣  Deploy to Kubernetes with Radius:"
echo "   # Create kind cluster (if needed)"
echo "   kind create cluster --name pong"
echo ""
echo "   # Build and load image"
echo "   cd pong && npm run build:local"
echo "   kind load docker-image pong-local:latest --name pong"
echo ""
echo "   # Deploy with Radius"
echo "   rad deploy pong.bicep"
echo ""
echo "   # Access the app"
echo "   kubectl port-forward svc/pong -n default-pong 3000:3000"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📚 Documentation:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "See README.md for:"
echo "  • Detailed deployment instructions"
echo "  • Environment variable configuration"
echo "  • Troubleshooting guide"
echo "  • Architecture overview"
echo ""
