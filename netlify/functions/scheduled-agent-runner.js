const runner = require('./agent-runner');

exports.config = { schedule: '@hourly' };

exports.handler = async (event) => {
  return runner.handler({
    httpMethod: 'POST',
    headers: { 'x-nova-cron-secret': process.env.NOVA_CRON_SECRET || '' },
    body: '{}'
  });
};
