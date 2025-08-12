import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  discountPrice: {
    type: Number,
    min: 0,
    validate: {
      validator: function(value) {
        // If discountPrice is provided, it must be less than the regular price
        return !value || value < this.price;
      },
      message: 'Discount price must be less than regular price'
    }
  },
  image: {
    type: String,
    required: true
  },
  cloudinaryId: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['painting', 'apparel', 'accessories']
  },
  size: {
    type: String,
    default: ''
  },
  material: {
    type: String,
    default: ''
  },
  inStock: {
    type: Boolean,
    default: true
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviews: {
    type: Number,
    default: 0,
    min: 0
  },
  featured: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for search functionality
productSchema.index({ 
  name: 'text', 
  description: 'text', 
});

// Index for category and featured products
productSchema.index({ category: 1, featured: 1 });
productSchema.index({ createdAt: -1 });

export default mongoose.model('Product', productSchema);