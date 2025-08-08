import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { upload } from '../config/cloudinary.js';
import HeroImage from '../models/HeroImage.js';
import cloudinary from '../config/cloudinary.js';

const router = express.Router();


// Public: Get all hero images
router.get('/', async (req, res) => {
  try {
    const images = await HeroImage.find().sort({ order: 1, createdAt: -1 });
    res.json({ success: true, images });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin only: Add a new hero image
router.post('/', authenticateToken, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Image is required' });
    const { title, subtitle, category, link, order } = req.body;
    const newImage = new HeroImage({
      title,
      subtitle: subtitle || '',
      category: category || 'painting',
      image: req.file.path,
      cloudinaryId: req.file.filename,
      link: link || '',
      order: order || 0
    });
    await newImage.save();
    res.json({ success: true, image: newImage });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin only: Delete a hero image
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const image = await HeroImage.findById(req.params.id);
    if (!image) return res.status(404).json({ success: false, message: 'Not found' });
    // Delete from cloudinary
    await cloudinary.uploader.destroy(image.cloudinaryId);
    await image.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin only: Update hero image order or info
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, subtitle, category, link, order } = req.body;
    const image = await HeroImage.findByIdAndUpdate(
      req.params.id,
      { title, subtitle, category, link, order },
      { new: true }
    );
    res.json({ success: true, image });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
