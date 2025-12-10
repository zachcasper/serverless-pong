// AWS Lambda handler
const { handleRequest } = require('./pong');

exports.handler = async (event) => {
  const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
  const path = event.path || event.rawPath || '/';
  const queryString = event.queryStringParameters 
    ? '?' + new URLSearchParams(event.queryStringParameters).toString()
    : '';
  const url = `https://${event.headers?.host || 'localhost'}${path}${queryString}`;
  
  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body) : null;

  const response = await handleRequest(method, url, body);

  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.body
  };
};
