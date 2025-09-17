import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

console.log('Cloudinary Config:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Not set',
  api_key: process.env.CLOUDINARY_API_KEY ? 'Set' : 'Not set',
  api_secret: process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Not set'
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Test Cloudinary connection
const testCloudinaryConnection = async () => {
  try {
    const result = await cloudinary.api.ping();
    console.log('✅ Cloudinary connection successful:', result);
  } catch (error) {
    console.error('❌ Cloudinary connection failed:', error);
  }
};

testCloudinaryConnection();

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'rangleela',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    public_id: (req, file) => {
      // Generate unique filename
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2);
      return `product_${timestamp}_${random}`;
    }
  }
});


export const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 3 // Allow maximum 3 files per upload
  },
  fileFilter: (req, file, cb) => {
    console.log('File upload attempt:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    // Allowed MIME types and extensions
    const allowedMimes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp'
    ];
    
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    
    // Check MIME type
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
    }
    
    // Check file extension
    const fileExtension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (!allowedExtensions.includes(fileExtension)) {
      return cb(new Error('Invalid file extension. Only .jpg, .jpeg, .png, and .webp files are allowed.'), false);
    }
    
    // Check for suspicious file names
    const suspiciousPatterns = [
      /\.php$/i, /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.scr$/i, /\.com$/i,
      /\.pif$/i, /\.vbs$/i, /\.js$/i, /\.jar$/i, /\.zip$/i, /\.rar$/i
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(file.originalname)) {
        return cb(new Error('Suspicious file name detected.'), false);
      }
    }
    
    // Check file size (additional check)
    if (file.size && file.size > 10 * 1024 * 1024) {
      return cb(new Error('File too large. Maximum size is 10MB.'), false);
    }
    
    cb(null, true);
  }
});

export default cloudinary;
