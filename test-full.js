/**
 * Full integration test — run from SwimCoach-project directory:
 *   cd C:\Users\tkuo9\.claude\projects\SwimCoach\SwimCoach-project
 *   node test-server.js   (already exists)
 *
 * Or just run this from any directory:
 */
const path = require('path');
const projectDir = path.join(__dirname, 'SwimCoach-project');
process.chdir(projectDir);

const { execSync } = require('child_process');

console.log('CWD:', process.cwd());
console.log('---');

// 1. Check .env
try {
  require('dotenv').config({ path: path.join(projectDir, '.env') });
  console.log('MONGODB_URI:', process.env.MONGODB_URI || '(not set, will use default)');
} catch (e) {
  console.log('No .env found, using defaults');
}

// 2. Check routes load
try {
  // We can't actually require routes without mongoose connected, but we can check syntax
  const { readdirSync, readFileSync } = require('fs');
  const routeFiles = readdirSync(path.join(projectDir, 'src', 'routes', 'api'));
  console.log('Route files:', routeFiles.join(', '));

  const serviceFiles = readdirSync(path.join(projectDir, 'src', 'services'));
  console.log('Service files:', serviceFiles.join(', '));

  const modelFiles = readdirSync(path.join(projectDir, 'src', 'models')).filter(f => f !== 'index.js');
  console.log('Model files:', modelFiles.join(', '));
} catch (e) {
  console.error('Error:', e.message);
}

// 3. Check if MongoDB is reachable
const net = require('net');
const mongoPort = parseInt(process.env.MONGODB_URI?.match(/:(\d+)\//)?.[1] || '27017');
const s = net.createConnection(mongoPort, 'localhost');
s.on('connect', () => {
  console.log('✓ MongoDB is reachable on port', mongoPort);
  s.destroy();

  // 4. Try to start the server
  try {
    const db = require(path.join(projectDir, 'src', 'models'));
    db.connectDB().then(() => {
      console.log('✓ MongoDB connected successfully');
      const app = require(path.join(projectDir, 'src', 'index'));
      console.log('✓ Server module loaded');
      console.log('\n--- ALL CHECKS PASSED ---');
      console.log('You can now run: npm start');
      setTimeout(() => process.exit(0), 1000);
    }).catch(err => {
      console.error('✗ MongoDB connection failed:', err.message);
      process.exit(1);
    });
  } catch (e) {
    console.error('✗ Failed to load:', e.message);
    process.exit(1);
  }
});
s.on('error', (e) => {
  console.log('✗ MongoDB NOT reachable on port', mongoPort, '-', e.message);
  console.log('\nStart MongoDB first:');
  console.log('  Docker:  docker-compose up -d  (in SwimCoach-project directory)');
  console.log('  Local:   net start MongoDB');
  process.exit(1);
});
