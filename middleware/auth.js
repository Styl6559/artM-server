import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { ADMIN_EMAILS } from '../server.js';
export const authenticateToken = async (req, res, next) => {
  try {
    // Get token from HTTP-only cookie
    const token = req.cookies.authToken;

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access token required' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    if (!user.isVerified) {
      return res.status(401).json({ 
        success: false, 
        message: 'Account not verified' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    
    return res.status(403).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
};

export const requireVerification = (req, res, next) => {
  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Account verification required'
    });
  }
  next();
};

// Admin middleware with better error handling
export const requireAdmin = (req, res, next) => {
  console.log('Admin check - User:', req.user?.email);
  
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // Check if user is admin
  if (!ADMIN_EMAILS.includes(req.user.email)) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }

  console.log('Admin access granted');
  next();
};
