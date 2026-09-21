const { execSync } = require('child_process');

// NOTE: Only the admin ejabberd user is pre-registered.
// Real users are registered dynamically via syncEjabberdUser() when they sign in via phone/google.
const users = [
  { u: 'admin', p: 'adminpass' },
];

console.log('Synchronizing ejabberd admin user...');
for (const { u, p } of users) {
  try {
    execSync(`docker exec instant_msg_xmpp ejabberdctl register ${u} localhost "${p}"`, { stdio: 'pipe' });
    console.log(`✅ Registered ${u}@localhost`);
  } catch (e) {
    // If user already exists, that's completely fine
    console.log(`ℹ️  ${u}@localhost is already registered`);
  }
}
console.log('Ejabberd admin user ready.');
