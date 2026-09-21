/**
 * Test script for verifying local XMPP server connectivity.
 * 
 * Usage:
 *   cd server
 *   npm install
 *   node test-xmpp.js
 */

const { client, xml } = require('@xmpp/client');

const SERVICE_URL = process.env.XMPP_SERVICE || 'ws://localhost:5280/ws';
const DOMAIN = process.env.XMPP_DOMAIN || 'localhost';

console.log('--------------------------------------------------');
console.log('Testing XMPP Connection to:', SERVICE_URL);
console.log('Domain:', DOMAIN);
console.log('--------------------------------------------------');

const xmpp = client({
  service: SERVICE_URL,
  domain: DOMAIN,
  resource: 'test-cli',
  username: 'alice',
  password: 'secret123',
});

xmpp.on('input', (data) => console.log('IN :', data.toString()));
xmpp.on('output', (data) => console.log('OUT:', data.toString()));

let testPassed = false;

xmpp.on('error', (err) => {
  console.error('❌ XMPP Error:', err.message);
});

xmpp.on('status', (status) => {
  console.log('📡 Status changed:', status);
});

xmpp.on('online', async (address) => {
  console.log(' Connected successfully as:', address.toString());

  // Send initial presence
  await xmpp.send(xml('presence'));
  console.log(' Sent presence stanza');

  // Send a test message to bob
  const msg = xml(
    'message',
    { type: 'chat', to: `bob@${DOMAIN}` },
    xml('body', {}, 'Hello from Alice via automated test!')
  );
  await xmpp.send(msg);
  console.log(' Sent test chat message to bob@' + DOMAIN);

  testPassed = true;

  setTimeout(async () => {
    console.log(' Closing connection...');
    await xmpp.stop();
    console.log('--------------------------------------------------');
    console.log(' XMPP local server test passed successfully!');
    console.log('--------------------------------------------------');
    process.exit(0);
  }, 1000);
});

xmpp.start().catch((err) => {
  console.error('❌ Failed to start XMPP connection:', err.message);
  console.log('\nTroubleshooting tips:');
  console.log('1. Make sure Docker container is running: docker compose up -d');
  console.log('2. Check server logs: docker compose logs');
  console.log('3. Ensure port 5280 is exposed.');
  process.exit(1);
});

// Timeout safeguard after 15 seconds
setTimeout(() => {
  if (!testPassed) {
    console.error('❌ Timed out waiting for XMPP connection.');
    process.exit(1);
  }
}, 15000);
