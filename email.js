import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendVerificationEmail = async (email, code, name) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Account</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 600; }
        .content { padding: 40px 20px; }
        .verification-code { background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; }
        .code { font-size: 36px; font-weight: bold; color: #1e293b; letter-spacing: 8px; font-family: 'Courier New', monospace; }
        .footer { background-color: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎨 RangLeela</h1>
        </div>
        <div class="content">
          <h2>Welcome, ${name}!</h2>
          <p>Thank you for signing up with RangLeela. To complete your registration and secure your account, please verify your email address using the code below:</p>
          
          <div class="verification-code">
            <p style="margin: 0 0 10px 0; color: #64748b; font-weight: 600;">Your Verification Code</p>
            <div class="code">${code}</div>
            <p style="margin: 10px 0 0 0; color: #64748b; font-size: 14px;">This code expires in 10 minutes</p>
          </div>
          
          <p>If you didn't create an account with us, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>© 2024 RangLeela. All rights reserved.</p>
          <p>This is an automated message, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: `RangLeela <${process.env.RESEND_SENDER_EMAIL}>`,
      to: email,
      subject: 'Verify Your Account - RangLeela',
      html,
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error sending email:', err);
    return { success: false, error: err.message };
  }
};

export const sendWelcomeEmail = async (email, name) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to RangLeela</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 600; }
        .content { padding: 40px 20px; }
        .welcome-badge { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 30px; border-radius: 50px; display: inline-block; font-weight: 600; margin: 20px 0; }
        .footer { background-color: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Welcome to RangLeela!</h1>
        </div>
        <div class="content">
          <h2>Congratulations, ${name}!</h2>
          <div style="text-align: center;">
            <div class="welcome-badge">✅ Account Verified Successfully</div>
          </div>
          <p>Your account has been successfully verified and you're now part of the RangLeela community!</p>
        </div>
        <div class="footer">
          <p>© 2024 RangLeela. All rights reserved.</p>
          <p>Thank you for choosing RangLeela for your art needs.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: `RangLeela <${process.env.RESEND_SENDER_EMAIL}>`,
      to: email,
      subject: 'Welcome to RangLeela! 🎉',
      html,
    });

    if (error) {
      console.error('Welcome email failed:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error:', err);
    return { success: false, error: err.message };
  }
};

export const sendOrderConfirmationEmail = async (email, name, order) => {
  const itemsList = order.items.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${item.product.name}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${item.price}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Confirmation</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #8b5cf6 0%, #f59e0b 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 600; }
        .content { padding: 40px 20px; }
        .order-details { background-color: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0; }
        .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .items-table th { background-color: #f1f5f9; padding: 12px; text-align: left; font-weight: 600; }
        .total-row { background-color: #f1f5f9; font-weight: bold; }
        .footer { background-color: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎨 Thank You for Your Purchase!</h1>
        </div>
        <div class="content">
          <h2>Dear ${name},</h2>
          <p>Thank you for your order! We're excited to let you know that your payment has been received and your order is being processed.</p>
          
          <div class="order-details">
            <h3>Order Details</h3>
            <p><strong>Order ID:</strong> #${order._id.toString().slice(-8).toUpperCase()}</p>
            <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
            <p><strong>Payment Status:</strong> Paid</p>
            <p><strong>Amount Received:</strong> ₹${order.totalAmount.toFixed(2)}</p>
          </div>

          <h3>Items Purchased</h3>
          <table class="items-table">
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align: center;">Quantity</th>
                <th style="text-align: right;">Price</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsList}
              <tr class="total-row">
                <td colspan="3" style="padding: 15px; text-align: right;">Total Amount:</td>
                <td style="padding: 15px; text-align: right;">₹${order.totalAmount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <div class="order-details">
            <h3>Shipping Address</h3>
            <p>${order.shippingAddress.name}<br>
            ${order.shippingAddress.address}<br>
            ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.pincode}<br>
            ${order.shippingAddress.country}</p>
          </div>

          <p>We'll send you another email when your order ships. You can track your order status in your account dashboard.</p>
        </div>
        <div class="footer">
          <p>© 2024 RangLeela. All rights reserved.</p>
          <p>Thank you for supporting artists and choosing RangLeela!</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: `RangLeela <${process.env.RESEND_SENDER_EMAIL}>`,
      to: email,
      subject: `Thanks for your purchase! - Order #${order._id.toString().slice(-8).toUpperCase()}`,
      html,
    });

    if (error) {
      console.error('Order confirmation email failed:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error:', err);
    return { success: false, error: err.message };
  }
};

export const sendDeliveryEmail = async (email, name, order) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Delivered</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 600; }
        .content { padding: 40px 20px; }
        .delivery-badge { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 30px; border-radius: 50px; display: inline-block; font-weight: 600; margin: 20px 0; }
        .rating-section { background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center; }
        .footer { background-color: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📦 Order Delivered!</h1>
        </div>
        <div class="content">
          <h2>Great news, ${name}!</h2>
          <div style="text-align: center;">
            <div class="delivery-badge">✅ Successfully Delivered</div>
          </div>
          <p>Your order <strong>#${order._id.toString().slice(-8).toUpperCase()}</strong> has been successfully delivered!</p>
          
          <p>We hope you absolutely love your new art pieces! Each item was carefully selected and crafted by talented artists.</p>

          <div class="rating-section">
            <h3 style="margin: 0 0 15px 0; color: #92400e;">⭐ Don't forget to rate your items!</h3>
            <p style="margin: 0 0 15px 0; color: #92400e;">We'd love to hear your feedback! Please take a moment to rate the items you received.</p>
            <p style="margin: 0; color: #92400e; font-weight: 600;">Visit "My Orders" in your account to rate your items!</p>
          </div>

          <p>If you have any questions about your order or need assistance, our customer support team is here to help.</p>
          
          <p>Thank you for supporting independent artists and choosing RangLeela for your art needs!</p>
        </div>
        <div class="footer">
          <p>© 2024 RangLeela. All rights reserved.</p>
          <p>Keep creating, keep inspiring! 🎨</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: `RangLeela <${process.env.RESEND_SENDER_EMAIL}>`,
      to: email,
      subject: `Your Order Has Been Delivered! - #${order._id.toString().slice(-8).toUpperCase()}`,
      html,
    });

    if (error) {
      console.error('Delivery email failed:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error:', err);
    return { success: false, error: err.message };
  }
};
