extension radius
extension functions

param environment string


resource pongApp 'Applications.Core/applications@2023-10-01-preview' = {
  name: 'pong2'
  properties: {
    environment: environment
  }
}

// resource pong 'Applications.Core/containers@2023-10-01-preview' = {
//   name: 'pong'
//   properties: {
//     application: pongApp.id
//     environment: environment
//     container: {
//       image: 'pong-local:latest'
//       imagePullPolicy: 'IfNotPresent'
//       ports: {
//         web: {
//           containerPort: 3000
//         }
//       }
//     }
    // connections: {
    //   redis: {
    //     source: redis.id
    //   }
//     }
//   }
// }

resource pong 'Radius.Compute/functions@2025-12-08-preview' = {
  name: 'pong2'
  properties: {
    application: pongApp.id
    environment: environment
    image: '817312594854.dkr.ecr.us-east-2.amazonaws.com/example-lambda-container:latest'
    // image: 'pong:latest'
    // connections: {
    //   redis: {
    //     source: redis.id
    //   }
    // }
  }
}

// resource redis 'Applications.Datastores/redisCaches@2023-10-01-preview' = {
//   name: 'redis'
//   properties: {
//     application: pongApp.id
//     environment: environment
//   }
// }
