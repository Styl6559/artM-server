import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { authenticateToken } from '../middleware/auth.js';
import { sendOrderConfirmationEmail } from '../email.js';

const router = express.Router();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Apply authentication to all routes
router.use(authenticateToken);

// Create Razorpay order
router.post('/create-order', [
  body('items').isArray().withMessage('Items must be an array'),
  body('shippingAddress').isObject().withMessage('Shipping address is required'),
  body('shippingAddress.name')
    .trim()
    .isLength({ min: 2, max: 30 }).withMessage('Name must be 2-30 characters'),
  body('shippingAddress.email')
    .isEmail().withMessage('Valid email is required')
    .isLength({ max: 50 }).withMessage('Email must be at most 50 characters'),
  body('shippingAddress.phone')
    .trim()
    .isLength({ min: 10, max: 15 }).withMessage('Phone must be 10-15 digits'),
  body('shippingAddress.address')
    .trim()
    .isLength({ min: 10, max: 100 }).withMessage('Address must be 10-100 characters'),
  body('shippingAddress.city')
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('City must be 2-50 characters'),
  body('shippingAddress.state')
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('State must be 2-50 characters'),
  body('shippingAddress.pincode')
    .trim()
    .isLength({ min: 6, max: 10 }).withMessage('Pincode must be 6-10 digits')
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

    const { items, shippingAddress, notes } = req.body;

    // Validate and calculate total amount
    let totalAmount = 0;
    const orderItems = [];

    if (items.length > 20) {
      return res.status(400).json({ success: false, message: 'Too many items in order' });
    }
    for (const item of items) {
      if (item.quantity > 10) {
        return res.status(400).json({ success: false, message: 'Quantity too high for item' });
      }
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product not found: ${item.productId}`
        });
      }

      if (!product.inStock) {
        return res.status(400).json({
          success: false,
          message: `Product out of stock: ${product.name}`
        });
      }

      const itemTotal = product.price * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        price: product.price,
        selectedSize: item.selectedSize || ''
      });
    }

    // Add GST (18%)
    const gstAmount = totalAmount * 0.18;
    const finalAmount = Math.round((totalAmount + gstAmount) * 100); // Convert to paise

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: finalAmount,
      currency: 'INR',
      receipt: `order_${Date.now()}`,
      notes: {
        userId: req.user._id.toString(),
        itemCount: orderItems.length.toString()
      }
    });

    // Create order in database
    const order = new Order({
      user: req.user._id,
      items: orderItems,
      totalAmount: finalAmount / 100, // Store in rupees
      razorpayOrderId: razorpayOrder.id,
      shippingAddress,
      notes: notes || '',
      status: 'pending'
    });

    await order.save();

    res.json({
      success: true,
      data: {
        orderId: razorpayOrder.id,
        amount: finalAmount,
        currency: 'INR',
        key: process.env.RAZORPAY_KEY_ID,
        order: order
      }
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order'
    });
  }
});

// Verify payment
router.post('/verify-payment', [
  body('razorpay_order_id').notEmpty().withMessage('Order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Signature is required')
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

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Update order status
    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id })
      .populate('items.product')
      .populate('user');
      
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    order.status = 'paid';
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.updatedAt = new Date();

    await order.save();

    // Send order confirmation email
    try {
      await sendOrderConfirmationEmail(
        order.shippingAddress.email,
        order.shippingAddress.name,
        order
      );
    } catch (emailError) {
      console.error('Failed to send order confirmation email:', emailError);
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: { order }
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed'
    });
  }
});

// Get user orders
router.get('/orders', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const orders = await Order.find({ user: req.user._id })
      .populate('items.product')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments({ user: req.user._id });

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

// Get single order
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id
    }).populate('items.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: { order }
    });

  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order'
    });
  }
});

// Submit rating for order item
router.post('/rate-item', [
  body('orderId').isMongoId().withMessage('Valid order ID required'),
  body('productId').isMongoId().withMessage('Valid product ID required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5')
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

    const { orderId, productId, rating } = req.body;

    // Verify the order belongs to the user and is delivered
    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
      status: 'delivered'
    });

    if (!order) {
      return res.status(400).json({
        success: false,
        message: 'Order not found or not delivered yet'
      });
    }

    // Check if the product is in the order
    const orderItem = order.items.find(item => item.product.toString() === productId);
    if (!orderItem) {
      return res.status(400).json({
        success: false,
        message: 'Product not found in this order'
      });
    }

    // Check if already rated
    if (orderItem.rating) {
      return res.status(400).json({
        success: false,
        message: 'You have already rated this item'
      });
    }

    // Update the order item with rating
    orderItem.rating = rating;
    await order.save();

    // Update product's average rating
    await updateProductRating(productId);

    res.json({
      success: true,
      message: 'Rating submitted successfully'
    });

  } catch (error) {
    console.error('Rate item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit rating'
    });
  }
});

// Helper function to update product rating
async function updateProductRating(productId) {
  try {
    // Get all ratings for this product from all orders
    const orders = await Order.find({
      'items.product': productId,
      'items.rating': { $exists: true, $ne: null }
    });

    let totalRating = 0;
    let ratingCount = 0;

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.product.toString() === productId && item.rating) {
          totalRating += item.rating;
          ratingCount++;
        }
      });
    });

    const averageRating = ratingCount > 0 ? totalRating / ratingCount : 0;

    await Product.findByIdAndUpdate(productId, {
      rating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
      reviews: ratingCount
    });

  } catch (error) {
    console.error('Update product rating error:', error);
  }
}

export default router;
