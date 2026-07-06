const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const emotionalSupportRoutes = require('./routes/emotionalSupportRoutes');

dotenv.config();

const { initializeDatabase } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '35mb' }));

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/medications', require('./routes/medications'));
app.use('/api/routines', require('./routes/routines'));
app.use('/api/intake-monitoring', require('./routes/intakeMonitoring'));
app.use('/api/allergies', require('./routes/allergies'));
app.use('/api/prescriptions', require('./routes/prescriptions'));
app.use('/api/emotional-support', emotionalSupportRoutes);
app.use('/api/assistant', require('./routes/assistant'));
app.use('/api/predict', require('./routes/predict'));
app.use('/api/health-advice', require('./routes/healthAdvice'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

const startServer = async () => {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to initialize server:', error.message);
    process.exit(1);
  }
};

startServer();
