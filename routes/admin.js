import express from 'express';
import { body, validationResult } from 'express-validator';
import Product from '../models/Product.js';
import Contact from '../models/Contact.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { upload } from '../config/cloudinary.js';
import cloudinary from '../config/cloudinary.js';
import { sendDeliveryEmail } from '../email.js';

const router = express.Router();

// Apply authentication and admin check to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Get dashboard analytics
router.get('/analytics', async (req, res) => {
  try {
    console.log('Fetching analytics for admin:', req.user.email);
    
    const [
      totalProducts,
      totalUsers,
      totalContacts,
      newContacts,
      totalOrders,
      pendingOrders,
      productsByCategory,
      recentContacts,
      recentOrders
    ] = await Promise.all([
      Product.countDocuments(),
      User.countDocuments(),
      Contact.countDocuments(),
      Contact.countDocuments({ status: 'new' }),
      Order.countDocuments(),
      Order.countDocuments({ status: { $in: ['paid', 'processing'] } }),
      Product.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]),
      Contact.find().sort({ createdAt: -1 }).limit(5),
      Order.find().populate('user', 'name email').sort({ createdAt: -1 }).limit(5)
    ]);

    const contactsBySubject = await Contact.aggregate([
      { $group: { _id: '$subject', count: { $sum: 1 } } }
    ]);

    const monthlyOrders = await Order.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 6 }
    ]);

    console.log('Analytics data:', {
      totalProducts,
      totalUsers,
      totalContacts,
      newContacts,
      totalOrders,
      pendingOrders
    });

    res.json({
      success: true,
      data: {
        overview: {
          totalProducts,
          totalUsers,
          totalContacts,
          newContacts,
          totalOrders,
          pendingOrders
        },
        productsByCategory,
        contactsBySubject,
        monthlyOrders,
        recentContacts,
        recentOrders
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics'
    });
  }
});

// Get all orders
router.get('/orders', async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const query = {};

    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate('user', 'name email')
      .populate('items.product', 'name image')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
});

// Update order status
router.put('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await Order.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true }
    ).populate('user', 'name email').populate('items.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Send delivery email if status is delivered
    if (status === 'delivered') {
      try {
        await sendDeliveryEmail(
          order.shippingAddress.email,
          order.shippingAddress.name,
          order
        );
      } catch (emailError) {
        console.error('Failed to send delivery email:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Order updated successfully',
      data: { order }
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order'
    });
  }
});

// Get all products
router.get('/products', async (req, res) => {
  try {
    console.log('Fetching products for admin');
    
    const { page = 1, limit = 50, category, search } = req.query;
    const query = {};

    if (category) query.category = category;
    if (search) {
      query.$text = { $search: search };
    }

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Product.countDocuments(query);

    // Transform products to include proper ID
    const transformedProducts = products.map(product => ({
      ...product.toObject(),
      id: product._id.toString()
    }));

    console.log(`Found ${transformedProducts.length} products`);

    res.json({
      success: true,
      data: {
        products: transformedProducts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
});

// Create product with enhanced error handling
router.post('/products', 
  upload.single('image'),
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('category').isIn(['painting', 'apparel']).withMessage('Invalid category'),
  ],
  async (req, res) => {
    try {
      console.log('Creating product - User:', req.user.email);
      console.log('Request body:', req.body);
      console.log('File:', req.file);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Product image is required'
        });
      }

      const { name, description, price, category, size, material, featured, inStock } = req.body;

      const product = new Product({
        name,
        description,
        price: parseFloat(price),
        category,
        size: size || '',
        material: material || '',
        image: req.file.path,
        cloudinaryId: req.file.filename,
        featured: featured === 'true',
        inStock: inStock !== 'false'
      });

      await product.save();
      console.log('Product created successfully:', product._id);

      // Transform product to include proper ID
      const transformedProduct = {
        ...product.toObject(),
        id: product._id.toString()
      };

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: { product: transformedProduct }
      });
    } catch (error) {
      console.error('Create product error:', error);
      
      // Clean up uploaded image if product creation fails
      if (req.file && req.file.filename) {
        try {
          await cloudinary.uploader.destroy(req.file.filename);
        } catch (cleanupError) {
          console.error('Failed to cleanup image:', cleanupError);
        }
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to create product: ' + error.message
      });
    }
  }
);

// Update product
router.put('/products/:id',
  upload.single('image'),
  async (req, res) => {
    try {
      console.log('Updating product:', req.params.id);
      
      const { id } = req.params;
      const updateData = { ...req.body };

      // Handle boolean fields
      if (updateData.featured !== undefined) {
        updateData.featured = updateData.featured === 'true';
      }
      if (updateData.inStock !== undefined) {
        updateData.inStock = updateData.inStock === 'true';
      }

      if (req.file) {
        // Delete old image from Cloudinary
        const product = await Product.findById(id);
        if (product && product.cloudinaryId) {
          await cloudinary.uploader.destroy(product.cloudinaryId);
        }
        
        updateData.image = req.file.path;
        updateData.cloudinaryId = req.file.filename;
      }

      updateData.updatedAt = new Date();

      const product = await Product.findByIdAndUpdate(id, updateData, { new: true });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Transform product to include proper ID
      const transformedProduct = {
        ...product.toObject(),
        id: product._id.toString()
      };

      console.log('Product updated successfully');

      res.json({
        success: true,
        message: 'Product updated successfully',
        data: { product: transformedProduct }
      });
    } catch (error) {
      console.error('Update product error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update product: ' + error.message
      });
    }
  }
);

// Delete product
router.delete('/products/:id', async (req, res) => {
  try {
    console.log('Deleting product:', req.params.id);
    
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Delete image from Cloudinary
    if (product.cloudinaryId) {
      await cloudinary.uploader.destroy(product.cloudinaryId);
    }

    await Product.findByIdAndDelete(id);
    console.log('Product deleted successfully');

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product: ' + error.message
    });
  }
});

// Get all contacts
router.get('/contacts', async (req, res) => {
  try {
    const { page = 1, limit = 50, status, subject } = req.query;
    const query = {};

    if (status) query.status = status;
    if (subject) query.subject = subject;

    const contacts = await Contact.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Contact.countDocuments(query);

    res.json({
      success: true,
      data: {
        contacts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contacts'
    });
  }
});

// Update contact status (auto-delete if resolved)
router.put('/contacts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // If status is resolved, delete the contact instead of updating
    if (status === 'resolved') {
      const contact = await Contact.findByIdAndDelete(id);
      
      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }

      res.json({
        success: true,
        message: 'Contact resolved and removed successfully',
        data: { deleted: true }
      });
    } else {
      // Update the contact status normally
      const contact = await Contact.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      );

      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }

      res.json({
        success: true,
        message: 'Contact updated successfully',
        data: { contact }
      });
    }
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update contact'
    });
  }
});

export default router;
