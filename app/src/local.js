// Standalone Express server for local development and testing
const express = require('express');
const { handleRequest } = require('./pong');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('[LOCAL] Starting application...');
console.log('[LOCAL] Environment variables:');
console.log('[LOCAL]   PORT:', PORT);
console.log('[LOCAL]   CONNECTION_REDIS_URL:', process.env.CONNECTION_REDIS_URL || 'not set');
console.log('[LOCAL]   NODE_ENV:', process.env.NODE_ENV || 'not set');

app.use(express.json());
app.use(express.text());

app.all('*', async (req, res) => {
  const method = req.method;
  const url = `http://${req.headers.host}${req.url}`;
  const body = req.body;

  console.log(`[REQUEST] ${method} ${req.url} - Headers:`, JSON.stringify(req.headers));
  console.log(`[REQUEST] Body:`, typeof body === 'object' ? JSON.stringify(body) : body);

  try {
    const response = await handleRequest(method, url, body);
    
    console.log(`[RESPONSE] Status: ${response.statusCode}`);
    console.log(`[RESPONSE] Headers:`, JSON.stringify(response.headers));

    res.status(response.statusCode);
    Object.entries(response.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.send(response.body);
  } catch (error) {
    console.error('[ERROR] Request handling failed:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 Serverless Pong running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} to play!`);
  console.log('[LOCAL] Server is listening and ready to accept connections');
});
