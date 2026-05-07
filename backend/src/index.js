const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const emotionalSupportRoutes = require('./modules/emotionalSupport/routes/emotionalSupportRoutes');

dotenv.config();

const {
  initializeDatabase,
  getDatabaseStatus,
  getDatabaseTroubleshootingHints,
  dbState,
} = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'Server is running',
    database: getDatabaseStatus(),
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/medications', require('./routes/medications'));
app.use('/api/routines', require('./routes/routines'));
app.use('/api/allergies', require('./routes/allergies'));
app.use('/api/prescriptions', require('./routes/prescriptions'));
app.use('/api/emotional-support', emotionalSupportRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

const connectDatabaseWithRetry = async () => {
  try {
    await initializeDatabase();
    console.log('[DB] Database initialization complete');
  } catch (error) {
    dbState.connected = false;
    dbState.lastError = error.message;
    console.error('Failed to initialize database:', error.message);
    const hints = getDatabaseTroubleshootingHints(error.message);
    hints.forEach((hint) => {
      console.error(`[DB] Hint: ${hint}`);
    });
    console.log('[DB] Retrying database connection in 10 seconds...');
    setTimeout(connectDatabaseWithRetry, 10000);
  }
};

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectDatabaseWithRetry();
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${PORT} is already in use.`);
    console.error('[Server] Stop the existing process on that port or change PORT in backend/.env.');
    process.exit(1);
  }

  console.error('[Server] Failed to start:', error.message);
  process.exit(1);
});
