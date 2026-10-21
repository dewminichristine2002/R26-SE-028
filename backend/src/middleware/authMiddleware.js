const jwt = require('jsonwebtoken');

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authorization token is required' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'eldermeds-dev-secret';
    const decoded = jwt.verify(token, secret);
    req.user = {
      id: decoded.userId,
      role: decoded.role || 'user',
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = {
  requireAuth,
};
