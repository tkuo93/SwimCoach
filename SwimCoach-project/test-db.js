const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/swimcoach';
console.log('Connecting to:', uri);

mongoose.connect(uri)
  .then(() => {
    console.log('✓ MongoDB connected successfully');
    console.log('Host:', mongoose.connection.host);
    console.log('Port:', mongoose.connection.port);
    console.log('DB:', mongoose.connection.name);
    return mongoose.disconnect();
  })
  .then(() => {
    console.log('✓ Disconnected cleanly');
    process.exit(0);
  })
  .catch((err) => {
    console.error('✗ Connection failed:', err.message);
    process.exit(1);
  });
