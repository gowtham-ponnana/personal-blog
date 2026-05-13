const bcrypt = require('bcryptjs');

// Usage: node generate-hash.js 'your-password-here'
async function generateHash() {
  const password = process.argv[2];

  if (!password) {
    console.error('Usage: node generate-hash.js "your-password"')
    process.exit(1)
  }

  const saltRounds = 12;
  const hash = await bcrypt.hash(password, saltRounds);
  
  console.log('\n🔐 Generated Password Hash:');
  console.log(hash);
  console.log('\nUse this in server/src/routes/auth.js\n');
}

generateHash();
