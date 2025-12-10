extension radius
extension functions
extension redisCaches

param environment string
param image string

resource pongApp 'Applications.Core/applications@2023-10-01-preview' = {
  name: 'pong'
  properties: {
    environment: environment
  }
}

resource pong 'Radius.Compute/functions@2023-10-01-preview' = {
  name: 'pong'
  properties: {
    application: pongApp.id
    environment: environment
    image: image
    connections: {
      redis: {
        source: redis.id
      }
    }
  }
}

resource redis 'Radius.Data/redisCaches@2023-10-01-preview' = {
  name: 'redis'
  properties: {
    application: pongApp.id
    environment: environment
    capacity: 'S'
  }
}
