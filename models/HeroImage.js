import mongoose from 'mongoose';


const heroImageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: function() {
      return this.category !== 'gallery';
    },
    trim: true,
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    enum: ['gallery', 'painting', 'apparel', 'accessories'],
    default: 'painting'
  },
  image: {
    type: String,
    required: true
  },
  cloudinaryId: {
    type: String,
    required: true
  },
  link: {
    type: String,
    default: ''
  },
  order: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('HeroImage', heroImageSchema);
