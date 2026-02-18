const mongoose = require('mongoose');

// Local MongoDB Connection
const MONGODB_URI = "mongodb://127.0.0.1:27017/samvidhanai";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('MongoDB Connection Error:', error.message);
    return null;
  }
};

// ================= USER SCHEMA =================
const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  emailOtp: String,
  phoneOtp: String,
  otpExpires: Date,
  isPremium: { type: Boolean, default: false },
  premiumExpiry: Date,
  consentGiven: { type: Boolean, default: false },
  consentDate: Date,
  accountStatus: { type: String, default: 'active' },
  deletionRequested: { type: Boolean, default: false },
  deletionRequestDate: Date,
  adsRemoved: { type: Boolean, default: false },
  language: { type: String, default: 'en' },
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
  problemDescription: String,
  chatHistory: [{
    query: String,
    response: String,
    mode: { type: String, enum: ['text', 'voice', 'visual'] },
    timestamp: { type: Date, default: Date.now },
    isPremium: { type: Boolean, default: false },
    citations: [String]
  }]
});

// ================= LAWYER SCHEMA =================
const lawyerSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  barCouncilNumber: { type: String, required: true, unique: true },
  aadhaarNumber: { type: String, required: true, unique: true },  // ADDED
  specialization: [String],
  experience: Number,
  courtJurisdiction: String,
  address: String,
  bio: String,
  isVerified: { type: Boolean, default: false },
  isApproved: { type: Boolean, default: false },
  emailOtp: String,
  phoneOtp: String,
  otpExpires: Date,
  accountStatus: { type: String, default: 'pending' },
  deletionRequested: { type: Boolean, default: false },
  deletionRequestDate: Date,
  rating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
  clients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  messages: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    message: String,
    reply: String,
    timestamp: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false }
  }]
});

// ================= ADMIN SCHEMA =================
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'superadmin' },
  lastLogin: Date
});

// ================= CHAT SCHEMA =================
const chatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lawyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lawyer' },
  messages: [{
    sender: { type: String, enum: ['user', 'lawyer', 'ai'] },
    content: String,
    timestamp: { type: Date, default: Date.now },
    attachments: [{ type: String }]
  }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// ================= CONSULTATION SCHEMA =================
const consultationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  query: { type: String, required: true },
  mode: { type: String, enum: ['text', 'voice', 'visual'], required: true },
  aiResponse: String,
  citations: [{ type: String }],
  isPremium: { type: Boolean, default: false },
  visualData: String,
  voiceData: String,
  timestamp: { type: Date, default: Date.now }
});

// ================= ADS SCHEMA =================
const adSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  imageUrl: String,
  link: String,
  advertiser: String,
  isActive: { type: Boolean, default: true },
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// ================= PAYMENT SCHEMA =================
const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['premium', 'ads_removal'], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  transactionId: String,
  createdAt: { type: Date, default: Date.now }
});

// ================= MODELS =================
const User = mongoose.model('User', userSchema);
const Lawyer = mongoose.model('Lawyer', lawyerSchema);
const Admin = mongoose.model('Admin', adminSchema);
const Chat = mongoose.model('Chat', chatSchema);
const Consultation = mongoose.model('Consultation', consultationSchema);
const Ad = mongoose.model('Ad', adSchema);
const Payment = mongoose.model('Payment', paymentSchema);

// ================= DEFAULT ADMIN =================
const initializeAdmin = async () => {
  try {
    const existingAdmin = await Admin.findOne({ username: 'samvidhan' });
    if (!existingAdmin) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('samvidhanai', 10);

      await Admin.create({
        username: 'samvidhan',
        password: hashedPassword,
        role: 'superadmin'
      });

      console.log('✅ Default admin created → samvidhan / samvidhanai');
    }
  } catch (error) {
    console.error('Admin initialization error:', error);
  }
};

// ================= SAMPLE ADS =================
const initializeAds = async () => {
  try {
    const adCount = await Ad.countDocuments();
    if (adCount === 0) {
      await Ad.create([
        { title: 'Legal Documentation Services', content: 'Documents drafted by experts.', advertiser: 'LegalDocs India' },
        { title: 'Property Registration', content: 'Hassle-free property registration.', advertiser: 'PropertyLaw India' },
        { title: 'Divorce Consultation', content: 'Expert divorce lawyers available.', advertiser: 'FamilyLaw Experts' }
      ]);

      console.log('✅ Sample ads created');
    }
  } catch (error) {
    console.error('Ads initialization error:', error);
  }
};

module.exports = {
  connectDB,
  initializeAdmin,
  initializeAds,
  User,
  Lawyer,
  Admin,
  Chat,
  Consultation,
  Ad,
  Payment
};