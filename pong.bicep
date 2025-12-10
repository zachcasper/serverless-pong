extension radius
extension functions
extension redisCaches

param environment string

resource pongApp 'Applications.Core/applications@2023-10-01-preview' = {
  name: 'pong'
  properties: {
    environment: environment
  }
}

resource pong 'Radius.Compute/functions@2025-12-08-preview' = {
  name: 'pong'
  properties: {
    application: pongApp.id
    environment: environment
    image: '817312594854.dkr.ecr.us-east-2.amazonaws.com/pong:latest'
    connections: {
      redis: {
        source: redis.id
      }
    }
  }
}

resource redis 'Radius.Data/redisCaches@2025-12-08-preview' = {
  name: 'redis'
  properties: {
    application: pongApp.id
    environment: environment
    capacity: 'S'
  }
}
