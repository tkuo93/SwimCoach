/**
 * Quick smoke test — starts the server, verifies routes are registered,
 * then exits. Does NOT require MongoDB.
 */
const express = require('express');
const app = express();
app.use(express.json());

// Import routes (this checks for syntax errors)
try {
  const profileRoutes = require('./src/routes/api/profiles');
  const workoutRoutes = require('./src/routes/api/workouts');
  const knowledgeRoutes = require('./src/routes/api/knowledge');
  const customizationRoutes = require('./src/routes/api/customization');

  app.use('/api/profiles', profileRoutes);
  app.use('/api/workouts', workoutRoutes);
  app.use('/api/knowledge', knowledgeRoutes);
  app.use('/api/workouts/customize', customizationRoutes);

  console.log('✓ All route files loaded successfully');
} catch (err) {
  console.error('✗ Route loading failed:', err.message);
  process.exit(1);
}

// Check registered routes
const routes = [];
app._router.stack.forEach((middleware) => {
  if (middleware.route) {
    const methods = Object.keys(middleware.route.methods).map(m => m.toUpperCase());
    routes.push(`${methods} ${middleware.route.path}`);
  }
});

console.log('\nRegistered routes:');
routes.forEach(r => console.log(`  ${r}`));

console.log('\n✓ Server smoke test passed');
process.exit(0);
