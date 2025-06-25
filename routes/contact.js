import express from 'express';
import { body, validationResult } from 'express-validator';
import Contact from '../models/Contact.js';

const router = express.Router();

// Submit contact form
router.post('/', [
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
      'general', 'order', 'shipping', 'return', 'artist', 'wholesale', 'press', 'other'
    ])
    .withMessage('Invalid subject'),
  body('message')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Message must be 10-500 characters')
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

export default router;
