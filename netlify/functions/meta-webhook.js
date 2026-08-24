const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'novaspark_meta_verify_2026';

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  // Meta webhook verification: GET with hub.mode, hub.verify_token and hub.challenge.
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const mode = params['hub.mode'];
    const token = params['hub.verify_token'];
    const challenge = params['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return response(200, challenge);
    }
    return response(403, 'Forbidden');
  }

  // Meta webhook event delivery.
  if (event.httpMethod === 'POST') {
    try {
      const payload = JSON.parse(event.body || '{}');
      console.log('META_WEBHOOK_EVENT', JSON.stringify(payload));
      return response(200, 'EVENT_RECEIVED');
    } catch (error) {
      console.error('META_WEBHOOK_INVALID_JSON', error);
      return response(400, 'Invalid JSON');
    }
  }

  return response(405, 'Method Not Allowed', { Allow: 'GET, POST' });
};
