const { execSync } = require('child_process');

const users = [
  { u: 'admin', p: 'adminpass' },
  { u: 'alice', p: 'secret123' },
  { u: 'bob', p: 'secret123' },
  { u: 'charlie', p: 'charlie123' },
];

console.log('Synchronizing seed users with ejabberd...');
for (const { u, p } of users) {
  try {
    execSync(`docker exec instant_msg_xmpp ejabberdctl register ${u} localhost "${p}"`, { stdio: 'pipe' });
    console.log(`✅ Registered ${u}@localhost`);
  } catch (e) {
    // If user already exists, that's completely fine
    console.log(`ℹ️  ${u}@localhost is already registered`);
  }
}
console.log('All seed users ready.');
