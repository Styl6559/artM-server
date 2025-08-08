import express from 'express';
import { body, validationResult } from 'express-validator';
import Contact from '../models/Contact.js';
import { authenticateToken } from '../middleware/auth.js';
import { upload } from '../config/cloudinary.js';

const router = express.Router();

// Submit contact form - requires authentication
router.post('/', 
  authenticateToken, // Add auth middleware
  [
    body('name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be 2-50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required')
    .isLength({ max: 50 })
    .withMessage('Email must be at most 50 characters'),
  body('subject')
    .isIn([
      'general', 'order', 'shipping', 'return', 'custom', 'artist', 'wholesale', 'press', 'other'
    ])
    .withMessage('Invalid subject'),
  body('message')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Message must be 10-1000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, subject, message } = req.body;

    const contact = new Contact({
      name,
      email,
      subject,
      message
    });

    await contact.save();

    res.status(201).json({
      success: true,
      message: 'Message sent successfully! We will get back to you soon.',
      data: { contact }
    });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message. Please try again.'
    });
  }
});

// Submit contact form with images (for custom designs)
router.post('/with-images', 
  authenticateToken,
  upload.array('images', 3), // Allow up to 3 images
  [
    body('name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be 2-50 characters'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email required')
      .isLength({ max: 50 })
      .withMessage('Email must be at most 50 characters'),
    body('subject')
      .isIn([
        'general', 'order', 'shipping', 'return', 'custom', 'artist', 'wholesale', 'press', 'other'
      ])
      .withMessage('Invalid subject'),
    body('message')
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Message must be 10-1000 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { name, email, subject, message } = req.body;
      const files = req.files || [];

      // Process uploaded images
      const images = files.map(file => ({
        url: file.path,
        cloudinaryId: file.filename,
        filename: file.originalname
      }));

      const contact = new Contact({
        name,
        email,
        subject,
        message,
        images
      });

      await contact.save();

      res.status(201).json({
        success: true,
        message: 'Message sent successfully! We will get back to you soon.',
        data: { contact }
      });

    } catch (error) {
      console.error('Contact submission error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send message. Please try again.'
      });
    }
  }
);

export default router;