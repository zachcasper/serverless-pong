const { app } = require('@azure/functions');
const { handleRequest } = require('./pong');

app.http('game', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: '{*path}',
  handler: async (request, context) => {
    context.log('Game function triggered');

    const method = request.method;
    const url = request.url;
    
    let body = null;
    if (method === 'POST') {
      try {
        body = await request.json();
      } catch (e) {
        body = await request.text();
      }
    }

    const response = await handleRequest(method, url, body);
    
    return {
      status: response.statusCode,
      headers: response.headers,
      body: response.body
    };
  }
});
