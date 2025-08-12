import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    enum: [
      'general',
      'order',
      'shipping',
      'return',
      'artist',
      'wholesale',
      'press',
      'other'
    ]
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['new', 'read', 'replied', 'resolved'],
    default: 'new'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for admin queries
contactSchema.index({ status: 1, createdAt: -1 });
contactSchema.index({ subject: 1 });

export default mongoose.model('Contact', contactSchema);
