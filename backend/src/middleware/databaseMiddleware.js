const { getPublicDatabaseStatus } = require('../config/db');

const requireDatabase = (req, res, next) => {
  const status = getPublicDatabaseStatus();

  if (!status.connected) {
    return res.status(503).json({
      error: 'Database unavailable. The server is running, but it cannot reach PostgreSQL right now.',
      database: status,
    });
  }

  return next();
};

module.exports = {
  requireDatabase,
};
