const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const emotionalSupportRoutes = require('./modules/emotionalSupport/routes/emotionalSupportRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

function mountIfExists(routePath, routeModulePath) {
  const absoluteModulePath = path.join(__dirname, routeModulePath);

  if (!fs.existsSync(`${absoluteModulePath}.js`)) {
    return;
  }

  app.use(routePath, require(routeModulePath));
}

mountIfExists('/api/auth', './routes/auth');
mountIfExists('/api/users', './routes/users');
mountIfExists('/api/medications', './routes/medications');
app.use('/api/emotional-support', emotionalSupportRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
