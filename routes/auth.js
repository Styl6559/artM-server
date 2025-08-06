import express from 'express';
import { body, validationResult } from 'express-validator';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendVerificationEmail, sendWelcomeEmail } from '../email.js';
import { generateVerificationCode } from '../utils/generateCode.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Validation middleware
const validateSignup = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8, max: 32 }).withMessage('Password must be 8-32 characters'),
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters')
];

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8, max: 32 }).withMessage('Password must be 8-32 characters')
];

const validateVerification = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
];

const validateProfileUpdate = [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('avatar').optional().isURL().withMessage('Avatar must be a valid URL')
];

const validatePasswordChange = [
  body('newPassword').isLength({ min: 8, max: 32 }).withMessage('New password must be 8-32 characters')
];

// Helper function to generate JWT
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Helper function to set HTTP-only cookie
const setTokenCookie = (res, token) => {
  res.cookie('authToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

// Register with email/password (store temporarily, don't save to DB until verified)
router.post('/register', validateSignup, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Send verification email first
    const emailResult = await sendVerificationEmail(email, verificationCode, name);
    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again.'
      });
    }

    // Return user data without saving to DB (will be saved on verification)
    res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email for verification code.',
      data: {
        email,
        name,
        password, // Temporarily return for frontend storage
        verificationCode,
        verificationCodeExpires,
        needsVerification: true
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
});

// Google OAuth registration/login
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: 'Google credential required'
      });
    }

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture, email_verified } = payload;

    if (!email || !email_verified) {
      return res.status(400).json({
        success: false,
        message: 'Google account email not verified'
      });
    }

    // Check if user exists
    let user = await User.findOne({ 
      $or: [{ email }, { googleId }] 
    });

    if (user) {
      // Update existing user with Google info if needed
      if (!user.googleId) {
        user.googleId = googleId;
        user.isVerified = true;
        user.avatar = picture || user.avatar;
        user.lastLogin = new Date();
        await user.save();
      } else {
        user.lastLogin = new Date();
        await user.save();
      }
    } else {
      // Create new user (Google users are automatically verified)
      user = new User({
        email,
        name,
        googleId,
        avatar: picture || '',
        isVerified: true,
        lastLogin: new Date()
      });
      await user.save();

      // Send welcome email
      await sendWelcomeEmail(email, name);
    }

    // Generate JWT token and set cookie
    const token = generateToken(user._id);
    setTokenCookie(res, token);

    res.json({
      success: true,
      message: user.isNew ? 'Account created successfully!' : 'Login successful!',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          isVerified: user.isVerified,
          lastLogin: user.lastLogin,
          googleId: user.googleId
        }
      }
    });

  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Google authentication failed'
    });
  }
});

// Login with email/password
router.post('/login', validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account temporarily locked due to too many failed login attempts'
      });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      await user.incLoginAttempts();
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: 'Please verify your email before logging in',
        needsVerification: true,
        email: user.email
      });
    }

    // Reset login attempts and update last login
    await user.resetLoginAttempts();
    user.lastLogin = new Date();
    await user.save();

    // Generate token and set cookie
    const token = generateToken(user._id);
    setTokenCookie(res, token);

    res.json({
      success: true,
      message: 'Login successful!',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          isVerified: user.isVerified,
          lastLogin: user.lastLogin,
          googleId: user.googleId
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
});

// Verify email with OTP (now saves user to DB)
router.post('/verify', validateVerification, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, code, userData } = req.body;

    // If userData is provided (from frontend), create new user
    if (userData) {
      // Verify the code matches
      if (userData.verificationCode !== code) {
        return res.status(400).json({
          success: false,
          message: 'Invalid verification code'
        });
      }

      // Check if code has expired
      if (new Date() > new Date(userData.verificationCodeExpires)) {
        return res.status(400).json({
          success: false,
          message: 'Verification code has expired'
        });
      }

      // Create user in database now that they're verified
      const user = new User({
        email: userData.email,
        password: userData.password,
        name: userData.name,
        isVerified: true,
        lastLogin: new Date()
      });

      await user.save();

      // Send welcome email
      await sendWelcomeEmail(email, user.name);

      // Generate token and set cookie
      const token = generateToken(user._id);
      setTokenCookie(res, token);

      return res.json({
        success: true,
        message: 'Email verified successfully! Welcome to Rangleela!',
        data: {
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
            isVerified: user.isVerified,
            lastLogin: user.lastLogin
          }
        }
      });
    }

    // Fallback for existing users
    const user = await User.findOne({ 
      email,
      verificationCode: code,
      verificationCodeExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    // Mark user as verified
    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    user.lastLogin = new Date();
    await user.save();

    // Send welcome email
    await sendWelcomeEmail(email, user.name);

    // Generate token and set cookie
    const token = generateToken(user._id);
    setTokenCookie(res, token);

    res.json({
      success: true,
      message: 'Email verified successfully! Welcome to Rangleela!',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          isVerified: user.isVerified,
          lastLogin: user.lastLogin
        }
      }
    });

  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed. Please try again.'
    });
  }
});

// Resend verification code
router.post('/resend-verification', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Valid email required'
      });
    }

    const { email, userData } = req.body;

    // Generate new verification code
    const verificationCode = generateVerificationCode();
    const verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Send verification email
    const emailResult = await sendVerificationEmail(email, verificationCode, userData?.name || 'User');
    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email'
      });
    }

    res.json({
      success: true,
      message: 'Verification code sent successfully!',
      data: {
        verificationCode,
        verificationCodeExpires
      }
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification code'
    });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: {
          id: req.user._id,
          email: req.user.email,
          name: req.user.name,
          avatar: req.user.avatar,
          isVerified: req.user.isVerified,
          lastLogin: req.user.lastLogin,
          createdAt: req.user.createdAt,
          googleId: req.user.googleId
        }
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

// Update user profile
router.put('/profile', authenticateToken, validateProfileUpdate, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, avatar } = req.body;
    const user = req.user;

    // Update user fields
    user.name = name;
    if (avatar) {
      user.avatar = avatar;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          isVerified: user.isVerified,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          googleId: user.googleId
        }
      }
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// Change password
router.put('/change-password', authenticateToken, validatePasswordChange, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;
    const user = req.user;

    // For Google users creating their first password, currentPassword might be empty
    if (user.googleId && !user.password && !currentPassword) {
      user.password = newPassword;
      await user.save();

      return res.json({
        success: true,
        message: 'Password created successfully'
      });
    }

    // For regular password changes, verify current password
    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is required'
      });
    }

    // Fetch fresh user from DB to ensure password is up-to-date
    const freshUser = await User.findById(user._id);
    const isValidPassword = await freshUser.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    freshUser.password = newPassword;
    await freshUser.save();
    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

// Logout (clear cookie)
router.post('/logout', (req, res) => {
  try {
    res.clearCookie('authToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

export default router;
