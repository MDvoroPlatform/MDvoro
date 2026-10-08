import { createServer } from 'node:http';

const port = Number(process.env.SUPABASE_MOCK_PORT || 54321);
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');

  if (request.url === '/auth/v1/health') {
    response.writeHead(200).end(JSON.stringify({ version: 'ci-auth-mock' }));
    return;
  }

  response.writeHead(401).end(JSON.stringify({
    code: 'invalid_credentials',
    message: 'CI mock: no authenticated user',
  }));
});

server.listen(port, '127.0.0.1');
