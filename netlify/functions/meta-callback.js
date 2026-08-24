exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { Allow: 'GET' }, body: 'Method Not Allowed' };
  }

  const params = event.queryStringParameters || {};
  const error = params.error;
  const code = params.code;

  if (error) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `<h1>NovaSpark Meta connection failed</h1><p>${String(error)}</p>`
    };
  }

  // The authorization code must be exchanged server-side using META_APP_SECRET.
  // Never expose the app secret in browser code or GitHub.
  if (!code) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: '<h1>NovaSpark Meta connection</h1><p>No authorization code was received.</p>'
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: '<h1>NovaSpark Meta connection</h1><p>Authorization received. Server-side token exchange is ready to be completed.</p>'
  };
};
