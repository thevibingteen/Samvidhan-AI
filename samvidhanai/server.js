console.log('Server process started...');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');
require('dotenv').config();

const { connectDB, initializeAdmin, initializeAds, User, Lawyer, Admin, Chat, Consultation, Ad, Payment } = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Google Gemini AI Integration
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Check for API Key
if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set in environment variables. AI features will not work.");
}

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "API_KEY_MISSING");
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  systemInstruction: `You are SamvidhanAI, an expert, unbiased Indian Legal Advisor. Your goal is to provide accurate, easy-to-understand legal advice based strictly on Indian Laws (Constitution of India, BNS, BNSS, BSA, and other relevant Acts).

    Guidelines:
    1. **Unbiased Advice:** Provide advice considering all parties involved. Do not take sides unless the law clearly defines a victim/perpetrator.
    2. **Citations:** You MUST cite relevant Sections, Articles, and Acts. Use the new criminal laws (BNS, BNSS, BSA) where applicable, but mention old IPC/CrPC sections for reference if needed.
    3. **Structure:** Use clear headings, bullet points, and steps.
    4. **Disclaimer:** Always end with a standard legal disclaimer.
    5. **Language:** Respond in the same language as the user query (English or Hindi). If Hindi, use Devanagari script.
    6. **Format:** Use bullet points (* or -) extensively for clarity. Avoid large blocks of text or paragraphs. Use headers (###) for sections.

    Output Format: return JSON with keys: "response" (markdown string), "citations" (array of strings), "disclaimer" (string).`,
  generationConfig: { responseMimeType: "application/json" }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'samvidhanai_secret_key_2026';

// Email transporter (configure with your SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// OTP Generation
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Authentication Middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access denied' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// ==================== SOCKET.IO (Real-time chat) ====================
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
}).on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join', ({ userId, lawyerId }) => {
    if (userId) socket.join(`user_${userId}`);
    if (lawyerId) socket.join(`lawyer_${lawyerId}`);
  });

  socket.on('sendMessage', async ({ from, to, message, role }) => {
    let chat = await Chat.findOne({ $or: [{ userId: from, lawyerId: to }, { userId: to, lawyerId: from }] });
    if (!chat) {
      chat = new Chat({ userId: role === 'user' ? from : to, lawyerId: role === 'lawyer' ? from : to, messages: [] });
      await chat.save();
    }
    const msg = { sender: role, content: message, timestamp: new Date() };
    await Chat.findByIdAndUpdate(chat._id, { $push: { messages: msg } });
    io.to(`user_${to}`).to(`lawyer_${to}`).emit('newMessage', msg);
  });

  socket.on('disconnect', () => console.log('Socket disconnected'));
});

// ==================== USER AUTHENTICATION ====================
app.post('/api/user/signup', async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body;
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) return res.status(400).json({ message: 'Email or phone already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const emailOtp = generateOTP();
    const phoneOtp = generateOTP();

    const user = new User({
      fullName, email, phone,
      password: hashedPassword,
      emailOtp, phoneOtp,
      otpExpires: new Date(Date.now() + 10 * 60 * 1000)
    });

    await user.save();

    // In production, send actual emails/SMS here
    console.log(`\n========== USER OTP ==========`);
    console.log(`Email: ${email}`);
    console.log(`Email OTP: ${emailOtp}`);
    console.log(`Phone: ${phone}`);
    console.log(`Phone OTP: ${phoneOtp}`);
    console.log(`==============================\n`);

    res.json({ message: 'OTP sent', userId: user._id, emailOtp, phoneOtp });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/user/verify-otp', async (req, res) => {
  try {
    const { userId, emailOtp, phoneOtp } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.otpExpires < new Date()) return res.status(400).json({ message: 'OTP expired' });
    if (user.emailOtp !== emailOtp || user.phoneOtp !== phoneOtp) return res.status(400).json({ message: 'Invalid OTP' });

    user.isVerified = true;
    user.emailOtp = user.phoneOtp = null;
    await user.save();

    const token = jwt.sign({ userId: user._id, role: 'user', email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Verification successful', token, user: { id: user._id, fullName: user.fullName, email: user.email, isPremium: user.isPremium, consentGiven: user.consentGiven } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/user/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
    if (!user.isVerified) return res.status(400).json({ message: 'Please verify your account first' });

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ userId: user._id, role: 'user', email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful', token, user: { id: user._id, fullName: user.fullName, email: user.email, phone: user.phone, isPremium: user.isPremium, consentGiven: user.consentGiven, adsRemoved: user.adsRemoved } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== FORGOT PASSWORD ====================
app.post('/api/user/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otp = generateOTP();
    user.emailOtp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    console.log(`\n========== FORGOT PASSWORD OTP ==========`);
    console.log(`Email: ${email}`);
    console.log(`OTP: ${otp}`);
    console.log(`=========================================\n`);

    res.json({ message: 'OTP sent' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/user/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.emailOtp !== otp || user.otpExpires < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    user.emailOtp = null;
    await user.save();
    res.json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== LAWYER AUTHENTICATION ====================
app.post('/api/lawyer/signup', async (req, res) => {
  try {
    const { fullName, email, phone, password, barCouncilNumber, aadhaarNumber, specialization, experience, courtJurisdiction, address, bio } = req.body;
    const existingLawyer = await Lawyer.findOne({ $or: [{ email }, { phone }, { barCouncilNumber }] });
    if (existingLawyer) return res.status(400).json({ message: 'Email, phone or bar council number already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const emailOtp = generateOTP();
    const phoneOtp = generateOTP();

    const lawyer = new Lawyer({
      fullName, email, phone, password: hashedPassword,
      barCouncilNumber,
      aadhaarNumber,
      specialization: Array.isArray(specialization) ? specialization : specialization?.split(','),
      experience, courtJurisdiction, address, bio,
      emailOtp, phoneOtp,
      otpExpires: new Date(Date.now() + 10 * 60 * 1000)
    });

    await lawyer.save();

    console.log(`\n========== LAWYER OTP ==========`);
    console.log(`Email: ${email}`);
    console.log(`Email OTP: ${emailOtp}`);
    console.log(`Phone: ${phone}`);
    console.log(`Phone OTP: ${phoneOtp}`);
    console.log(`================================\n`);

    res.json({ message: 'OTP sent', lawyerId: lawyer._id, emailOtp, phoneOtp });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/lawyer/verify-otp', async (req, res) => {
  try {
    const { lawyerId, emailOtp, phoneOtp } = req.body;
    const lawyer = await Lawyer.findById(lawyerId);
    if (!lawyer) return res.status(404).json({ message: 'Lawyer not found' });
    if (lawyer.otpExpires < new Date()) return res.status(400).json({ message: 'OTP expired' });
    if (lawyer.emailOtp !== emailOtp || lawyer.phoneOtp !== phoneOtp) return res.status(400).json({ message: 'Invalid OTP' });

    lawyer.isVerified = true;
    lawyer.emailOtp = lawyer.phoneOtp = null;
    await lawyer.save();

    res.json({ message: 'Verification successful. Awaiting admin approval.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/lawyer/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const lawyer = await Lawyer.findOne({ email });
    if (!lawyer) return res.status(404).json({ message: 'Lawyer not found' });

    const isMatch = await bcrypt.compare(password, lawyer.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
    if (!lawyer.isVerified) return res.status(400).json({ message: 'Please verify your account first' });
    if (!lawyer.isApproved) return res.status(400).json({ message: 'Account pending admin approval' });

    lawyer.lastLogin = new Date();
    await lawyer.save();

    const token = jwt.sign({ lawyerId: lawyer._id, role: 'lawyer', email: lawyer.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful', token, lawyer: { id: lawyer._id, fullName: lawyer.fullName, email: lawyer.email, specialization: lawyer.specialization, barCouncilNumber: lawyer.barCouncilNumber } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== ADMIN AUTHENTICATION ====================
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    admin.lastLogin = new Date();
    await admin.save();

    const token = jwt.sign({ adminId: admin._id, role: 'admin', username: admin.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful', token });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== ADMIN ROUTES ====================
app.get('/api/admin/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  const users = await User.find({}, { password: 0, emailOtp: 0, phoneOtp: 0 });
  res.json(users);
});

app.get('/api/admin/lawyers', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  const lawyers = await Lawyer.find({}, { password: 0, emailOtp: 0, phoneOtp: 0 });
  res.json(lawyers);
});

app.get('/api/admin/pending-lawyers', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  const lawyers = await Lawyer.find({ isApproved: false, isVerified: true });
  res.json(lawyers);
});

app.post('/api/admin/approve-lawyer/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  const lawyer = await Lawyer.findById(req.params.id);
  if (!lawyer) return res.status(404).json({ message: 'Lawyer not found' });
  lawyer.isApproved = true;
  lawyer.accountStatus = 'active';
  await lawyer.save();
  res.json({ message: 'Lawyer approved' });
});

app.post('/api/admin/approve-deletion/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  const { type } = req.body;
  if (type === 'user') await User.findByIdAndDelete(req.params.id);
  else await Lawyer.findByIdAndDelete(req.params.id);
  res.json({ message: 'Account deleted' });
});

// ==================== USER ROUTES ====================
app.get('/api/user/profile', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.userId, { password: 0, emailOtp: 0, phoneOtp: 0 });
  res.json(user);
});

app.put('/api/user/profile', authMiddleware, async (req, res) => {
  const { fullName, problemDescription, language } = req.body;
  const user = await User.findByIdAndUpdate(req.user.userId, { fullName, problemDescription, language }, { new: true });
  res.json(user);
});

app.post('/api/user/change-password-request', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.userId);
  const otp = generateOTP();
  user.emailOtp = otp;
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  console.log(`\n========== PASSWORD CHANGE OTP ==========`);
  console.log(`Email: ${user.email}`);
  console.log(`OTP: ${otp}`);
  console.log(`=========================================\n`);
  res.json({ message: 'OTP sent', otp });
});

app.post('/api/user/change-password-verify', authMiddleware, async (req, res) => {
  const { otp, newPassword } = req.body;
  const user = await User.findById(req.user.userId);
  if (user.emailOtp !== otp || user.otpExpires < new Date()) {
    return res.status(400).json({ message: 'Invalid or expired OTP' });
  }
  user.password = await bcrypt.hash(newPassword, 10);
  user.emailOtp = null;
  await user.save();
  res.json({ message: 'Password changed' });
});

app.post('/api/user/request-deletion', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.userId);
  user.deletionRequested = true;
  user.deletionRequestDate = new Date();
  await user.save();
  res.json({ message: 'Deletion request submitted' });
});

app.post('/api/user/consent', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.userId);
  user.consentGiven = true;
  user.consentDate = new Date();
  await user.save();
  res.json({ message: 'Consent recorded' });
});

app.get('/api/user/chat-history', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.userId);
  res.json(user.chatHistory || []);
});

// ==================== AI CONSULTATION (Google Gemini RAG) ====================
// ==================== LEGAL KNOWLEDGE BASE ====================
const legalReferenceData = [
  {
    keywords: ['fundamental rights', 'basic rights', 'मौलिक अधिकार', 'right to equality', 'right to freedom', 'article 14', 'article 19', 'article 21'],
    response: `**Fundamental Rights under the Indian Constitution (Part III)**\n\nThe Constitution of India guarantees six Fundamental Rights to every citizen:\n\n1. **Right to Equality (Articles 14-18):** Equality before law, prohibition of discrimination on grounds of religion, race, caste, sex, or place of birth. Abolition of untouchability and titles.\n\n2. **Right to Freedom (Articles 19-22):** Freedom of speech and expression, assembly, association, movement, residence, and profession. Protection against arrest and detention.\n\n3. **Right against Exploitation (Articles 23-24):** Prohibition of human trafficking, forced labour, and child labour in hazardous industries.\n\n4. **Right to Freedom of Religion (Articles 25-28):** Freedom of conscience and free profession, practice, and propagation of religion.\n\n5. **Cultural and Educational Rights (Articles 29-30):** Protection of interests of minorities and their right to establish educational institutions.\n\n6. **Right to Constitutional Remedies (Article 32):** Right to move the Supreme Court for enforcement of Fundamental Rights through writs (Habeas Corpus, Mandamus, Prohibition, Certiorari, Quo Warranto).`,
    citations: ['Article 14 - Right to Equality', 'Article 19 - Right to Freedom', 'Article 21 - Right to Life and Personal Liberty', 'Article 32 - Right to Constitutional Remedies', 'Part III - Constitution of India']
  },
  {
    keywords: ['fir', 'police complaint', 'file complaint', 'पुलिस शिकायत', 'एफआईआर', 'first information report', 'lodge fir', 'police report'],
    response: `**How to File an FIR (First Information Report) in India**\n\n**What is an FIR?**\nAn FIR is a written document prepared by the police when they receive information about the commission of a cognizable offence. It is the first step in the criminal justice process.\n\n**Steps to File an FIR:**\n\n1. **Visit the nearest police station** — Any person can file an FIR, whether or not they are the victim.\n\n2. **Provide information** — Narrate the incident to the Station House Officer (SHO). Include details like date, time, place, and description of the accused if known.\n\n3. **Get it in writing** — The police officer must write down the information. You can file the FIR in any language.\n\n4. **Read and sign** — Read the FIR carefully before signing it. You are entitled to a free copy of the FIR.\n\n5. **Zero FIR** — Under Section 173 of Bharatiya Nagarik Suraksha Sanhita (BNSS), you can file an FIR at ANY police station regardless of jurisdiction.\n\n**If Police Refuses to File FIR:**\n- Send written complaint to the Superintendent of Police (SP)\n- File a complaint before the Judicial Magistrate under Section 175(3) BNSS\n- File an online FIR on the state police website\n\n**Important:** Filing a false FIR is punishable under Section 211 of Bharatiya Nyaya Sanhita (BNS).`,
    citations: ['Section 173 BNSS - Information in Cognizable Cases', 'Section 175(3) BNSS - Magistrate Power', 'Section 211 BNS - False Charge of Offence', 'Lalita Kumari v. Govt. of U.P. (2014) - Mandatory FIR Registration']
  },
  {
    keywords: ['divorce', 'तलाक', 'marriage dissolution', 'divorce process', 'mutual divorce', 'contested divorce', 'विवाह विच्छेद'],
    response: `**Divorce Laws in India**\n\n**Types of Divorce:**\n\n1. **Mutual Consent Divorce (Section 13-B, Hindu Marriage Act):**\n   - Both spouses agree to separate\n   - Must be living separately for at least 1 year\n   - Two petitions filed with 6-month gap (cooling period)\n   - Supreme Court can waive the 6-month cooling period in exceptional cases\n\n2. **Contested Divorce (Section 13, Hindu Marriage Act):**\n   Grounds include:\n   - Adultery\n   - Cruelty (physical or mental)\n   - Desertion for 2+ years\n   - Conversion to another religion\n   - Unsoundness of mind\n   - Incurable disease\n\n**For Other Religions:**\n- **Muslim Law:** Talaq, Khula, Mubarat, judicial divorce\n- **Christian:** Indian Divorce Act, 1869\n- **Special Marriage Act:** Applies to inter-faith marriages\n\n**Maintenance & Alimony:**\n- Wife can claim maintenance under Section 125 CrPC/Section 144 BNSS\n- Maintenance amount depends on husband's income and wife's needs\n- Children's custody decided based on child's welfare\n\n**Process:** File petition in Family Court → Service of notice → Response → Mediation → Trial → Decree`,
    citations: ['Section 13 - Hindu Marriage Act, 1955', 'Section 13-B - Mutual Consent Divorce', 'Section 125 CrPC / Section 144 BNSS - Maintenance', 'Special Marriage Act, 1954', 'Indian Divorce Act, 1869']
  },
  {
    keywords: ['consumer rights', 'consumer complaint', 'उपभोक्ता', 'consumer protection', 'product defect', 'defective product', 'consumer court', 'consumer forum'],
    response: `**Consumer Rights & Consumer Protection Act, 2019**\n\n**Six Consumer Rights:**\n1. **Right to Safety** — Protection against hazardous goods\n2. **Right to Information** — Complete details about product quality, quantity, price\n3. **Right to Choose** — Access to variety of goods at competitive prices\n4. **Right to be Heard** — Consumer interests to receive due consideration\n5. **Right to Seek Redressal** — Fair settlement of genuine grievances\n6. **Right to Consumer Education** — Knowledge about consumer rights\n\n**How to File a Complaint:**\n\n1. **District Consumer Forum:** For claims up to ₹1 crore\n2. **State Consumer Commission:** For claims ₹1 crore to ₹10 crore\n3. **National Consumer Commission:** For claims above ₹10 crore\n\n**Filing Process:**\n- Can file online at consumerhelpline.gov.in or edaakhil.nic.in\n- Complaint must be filed within 2 years of cause of action\n- No lawyer required (but recommended for complex cases)\n- Nominal fees (₹100-₹5000 depending on claim)\n\n**E-Commerce:** The Act covers online purchases. Complaints can be filed against e-commerce platforms.\n\n**Helpline:** National Consumer Helpline — 1800-11-4000 (Toll-free)`,
    citations: ['Consumer Protection Act, 2019', 'Section 34 - District Consumer Forum', 'Section 47 - State Commission', 'Section 58 - National Commission', 'E-Commerce Rules, 2020']
  },
  {
    keywords: ['tenant', 'rent', 'landlord', 'eviction', 'किराया', 'किरायेदार', 'मकान मालिक', 'rental agreement', 'tenant rights'],
    response: `**Tenant Rights in India**\n\n**Key Tenant Protections:**\n\n1. **Right to Written Agreement:** Always insist on a registered rent agreement. Oral agreements are hard to enforce.\n\n2. **Security Deposit:** Model Tenancy Act 2021 caps security deposit at 2 months' rent for residential property.\n\n3. **Eviction Protection:** A landlord cannot evict without proper legal notice and valid grounds:\n   - Non-payment of rent (after 2 months' notice)\n   - Subletting without permission\n   - Misuse of property\n   - Landlord's genuine personal need\n   - Property in dangerous condition\n\n4. **Essential Services:** Landlord cannot cut off water, electricity, or other essential services to force eviction.\n\n5. **Rent Increase:** Rent can only be increased as per the agreement terms. Arbitrary hikes are not allowed.\n\n6. **Privacy:** Landlord must give reasonable notice (24 hours recommended) before visiting the property.\n\n**If Illegally Evicted:**\n- File complaint at local police station\n- Approach Rent Controller/Civil Court\n- File complaint under Section 441 BNS (Criminal Trespass)\n\n**Rent Authority:** Under Model Tenancy Act, disputes are resolved by Rent Authority within 60 days.`,
    citations: ['Model Tenancy Act, 2021', 'Transfer of Property Act, 1882 - Section 106', 'Section 441 BNS - Criminal Trespass', 'Rent Control Acts (State-specific)', 'Registration Act, 1908']
  },
  {
    keywords: ['ipc', 'criminal', 'bns', 'bharatiya nyaya', 'punishment', 'offence', 'crime', 'अपराध', 'दंड', 'murder', 'theft', 'assault'],
    response: `**Criminal Law in India — Bharatiya Nyaya Sanhita (BNS), 2023**\n\nThe BNS replaced the Indian Penal Code (IPC) from July 1, 2024.\n\n**Key Offences & Punishments:**\n\n1. **Murder (Section 101 BNS):** Death or life imprisonment + fine\n2. **Attempt to Murder (Section 109 BNS):** Up to 10 years + fine\n3. **Kidnapping (Section 137 BNS):** Up to 7 years + fine\n4. **Theft (Section 303 BNS):** Up to 3 years, or fine, or both\n5. **Robbery (Section 309 BNS):** Up to 10 years + fine\n6. **Cheating (Section 318 BNS):** Up to 3 years + fine\n7. **Criminal Intimidation (Section 351 BNS):** Up to 2 years + fine\n8. **Assault (Section 115 BNS):** Up to 3 months + fine up to ₹1000\n\n**Important Provisions:**\n- **Section 69 BNS:** Sexual intercourse by deceitful means — up to 10 years\n- **Section 79 BNS:** Word, gesture, or act to insult modesty of woman\n- **Section 111 BNS:** Organized crime — addressed for the first time\n- **Section 113 BNS:** Terrorism — comprehensive definition added\n\n**Bail Provisions:** Under BNSS, bail is a right for offences punishable up to 3 years. For serious offences, the court has discretion.`,
    citations: ['Bharatiya Nyaya Sanhita (BNS), 2023', 'Section 101 BNS - Murder', 'Section 303 BNS - Theft', 'Section 318 BNS - Cheating', 'Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023']
  },
  {
    keywords: ['property', 'land', 'succession', 'inheritance', 'will', 'संपत्ति', 'जमीन', 'उत्तराधिकार', 'वसीयत', 'property dispute', 'land dispute'],
    response: `**Property Law in India**\n\n**Types of Property Transfer:**\n1. **Sale:** Transfer of ownership for a price (requires registration for immovable property above ₹100)\n2. **Gift:** Voluntary transfer without consideration (must be registered)\n3. **Will:** Transfer after death of owner\n4. **Inheritance:** Transfer by succession law\n\n**Key Laws:**\n\n**Hindu Succession Act, 1956 (amended 2005):**\n- Daughters have equal coparcenary rights as sons in ancestral property\n- A Hindu can make a will for self-acquired property\n- Ancestral property is divided equally among all legal heirs\n\n**Registration:**\n- All property transactions above ₹100 must be registered under the Registration Act, 1908\n- Stamp duty varies by state (typically 5-8% of property value)\n\n**Property Disputes:**\n- Civil suit in appropriate court\n- Revenue courts for land-related disputes\n- RERA (Real Estate Regulatory Authority) for builder-buyer disputes\n\n**Important:** Always verify property title, encumbrance certificate, and land records before purchasing. Check for any pending litigation on the property.`,
    citations: ['Transfer of Property Act, 1882', 'Hindu Succession Act, 1956 (Amendment 2005)', 'Registration Act, 1908', 'Indian Succession Act, 1925', 'RERA Act, 2016']
  },
  {
    keywords: ['cyber crime', 'online fraud', 'hacking', 'साइबर अपराध', 'ऑनलाइन धोखाधड़ी', 'identity theft', 'cyber bullying', 'data privacy', 'it act'],
    response: `**Cyber Crime Laws in India**\n\n**Information Technology Act, 2000 (IT Act):**\n\n1. **Hacking (Section 66):** Up to 3 years imprisonment + fine up to ₹5 lakh\n2. **Identity Theft (Section 66C):** Up to 3 years + fine up to ₹1 lakh\n3. **Cyber Stalking (Section 354D IPC / BNS):** Up to 3 years\n4. **Publishing Obscene Material (Section 67):** Up to 5 years + fine up to ₹10 lakh\n5. **Data Breach by Company (Section 43A):** Compensation to affected persons\n\n**How to Report Cyber Crime:**\n1. **National Cyber Crime Portal:** cybercrime.gov.in\n2. **Helpline:** 1930 (Cyber Crime Helpline)\n3. **Local Police Station:** File FIR with Cyber Cell\n4. **Email:** Report to cert-in@cert-in.org.in\n\n**Digital Personal Data Protection Act, 2023:**\n- Governs collection and processing of personal data\n- Consent-based data processing\n- Penalties up to ₹250 crore for data breaches\n- Data fiduciary obligations\n\n**Online Fraud Prevention Tips:**\n- Never share OTP, PIN, or passwords\n- Verify UPI requests before approving\n- Report suspicious transactions within 3 days to bank for full refund eligibility`,
    citations: ['Information Technology Act, 2000', 'Section 66 IT Act - Hacking', 'Section 66C IT Act - Identity Theft', 'Digital Personal Data Protection Act, 2023', 'RBI Circular on Digital Fraud']
  },
  {
    keywords: ['labour', 'labor', 'employment', 'salary', 'wages', 'termination', 'वेतन', 'नौकरी', 'रोजगार', 'minimum wage', 'working hours', 'pf', 'provident fund', 'gratuity'],
    response: `**Labour Laws in India**\n\n**Four Labour Codes (replacing 29 old laws):**\n\n1. **Code on Wages, 2019:**\n   - Minimum wage applicable to ALL employees (organized & unorganized)\n   - Equal pay for equal work regardless of gender\n   - Wages must be paid by 7th of every month\n\n2. **Industrial Relations Code, 2020:**\n   - Retrenchment: 15 days' average pay per year of service\n   - Prior government permission needed for layoff/retrenchment in firms with 300+ workers\n   - Strikes require 14 days' advance notice\n\n3. **Social Security Code, 2020:**\n   - **PF (Provident Fund):** 12% each by employer and employee\n   - **Gratuity:** 15 days' salary per year after 5 years of service\n   - **ESI:** For salary up to ₹21,000/month\n\n4. **Occupational Safety, Health & Working Conditions Code, 2020:**\n   - Maximum 8 hours/day working time\n   - Overtime pay at 2x normal rate\n   - Annual leave: 1 day per 20 days worked\n   - No female worker to work beyond 7 PM (with exceptions and consent)\n\n**Wrongful Termination:** Approach Labour Court or Industrial Tribunal within 3 years.`,
    citations: ['Code on Wages, 2019', 'Industrial Relations Code, 2020', 'Social Security Code, 2020', 'Occupational Safety Code, 2020', 'Payment of Gratuity Act, 1972']
  },
  {
    keywords: ['rti', 'right to information', 'सूचना का अधिकार', 'information act', 'government information', 'public information'],
    response: `**Right to Information (RTI) Act, 2005**\n\n**What is RTI?**\nEvery citizen has the right to request information from any public authority (government body). The authority must respond within 30 days.\n\n**How to File RTI:**\n\n1. **Online:** Visit rtionline.gov.in (for Central Government)\n2. **Offline:** Write application on plain paper addressed to the PIO (Public Information Officer)\n\n**Application Requirements:**\n- Name and address of applicant\n- Details of information required\n- Fee of ₹10 (by cash/DD/IPO/Court Fee Stamp)\n- BPL applicants are exempt from fees\n\n**Timeline:**\n- Normal: 30 days from receipt\n- Life/Liberty related: 48 hours\n- Third party information: 40 days\n\n**If Denied or No Response:**\n- **First Appeal:** To senior officer within 30 days\n- **Second Appeal:** To Information Commission within 90 days\n\n**Penalties:** If officer fails to provide information without reasonable cause, penalty of ₹250 per day, up to ₹25,000.\n\n**Exemptions (Section 8):** National security, personal privacy, cabinet papers, trade secrets, etc.\n\n**Important:** RTI cannot be filed for information from private bodies (unless they receive government funding).`,
    citations: ['Right to Information Act, 2005', 'Section 6 - Application for Information', 'Section 7 - Disposal of Request', 'Section 8 - Exemptions', 'Section 20 - Penalties']
  },
  {
    keywords: ['women', 'domestic violence', 'dowry', 'harassment', 'sexual harassment', 'महिला', 'घरेलू हिंसा', 'दहेज', 'उत्पीड़न', 'posh', 'workplace harassment'],
    response: `**Laws Protecting Women in India**\n\n1. **Protection of Women from Domestic Violence Act, 2005:**\n   - Covers physical, mental, sexual, verbal, and economic abuse\n   - Wife, live-in partner, or any female family member can file complaint\n   - Relief: Protection orders, residence orders, monetary relief, custody orders\n   - Complaint to Protection Officer or Magistrate\n\n2. **Dowry Prohibition Act, 1961:**\n   - Giving/taking dowry is punishable with 5 years imprisonment + ₹15,000 fine or dowry amount\n   - Section 304-B IPC/Section 80 BNS: Dowry death — 7 years to life imprisonment\n\n3. **Sexual Harassment at Workplace (POSH Act, 2013):**\n   - Every organization with 10+ employees must have Internal Complaints Committee (ICC)\n   - Complaint within 3 months of incident\n   - Employer liable for non-compliance\n\n4. **Section 354 BNS:** Assault or criminal force to woman with intent to outrage modesty — up to 5 years\n5. **Section 63 BNS (Rape):** 10 years to life imprisonment\n\n**Helplines:**\n- Women Helpline: 181\n- National Commission for Women: 7827-170-170\n- Police Emergency: 112`,
    citations: ['Protection of Women from Domestic Violence Act, 2005', 'Dowry Prohibition Act, 1961', 'POSH Act, 2013', 'Section 63 BNS - Rape', 'Section 354 BNS - Assault on Woman']
  }
];

function getRelevantContext(query) {
  const q = query.toLowerCase();

  // Find best matching topic
  let bestMatch = null;
  let bestScore = 0;

  for (const topic of legalReferenceData) {
    let score = 0;
    for (const keyword of topic.keywords) {
      if (q.includes(keyword.toLowerCase())) {
        score += keyword.length; // Longer keyword matches are more specific
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = topic;
    }
  }

  return (bestMatch && bestScore > 0) ? bestMatch : null;
}

// ==================== AI CONSULTATION (Google Gemini RAG) ====================
app.post('/api/consultation', authMiddleware, async (req, res) => {
  try {
    const { query, mode, visualData } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ message: 'Query is required' });
    }

    // Check for API Key FIRST
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        message: 'AI Service Unavailable',
        response: 'The AI service is currently unavailable because the API key is missing. Please contact the administrator to set the GEMINI_API_KEY in the environment variables.',
        citations: [],
        disclaimer: 'System Error: Essential configuration missing.'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 1. Retrieve Context (RAG)
    const context = getRelevantContext(query.trim());
    let contextPrompt = "";
    if (context) {
      contextPrompt = `\n\nRELEVANT LEGAL CONTEXT (Use this if accurate, but verify with your knowledge base):\n${context.response}\n\nExisting Citations in Context: ${context.citations.join(", ")}`;
    }

    // 2. Call Gemini API
    const prompt = `User Query: "${query}"${contextPrompt ? `\n\nRELEVANT LEGAL CONTEXT:\n${contextPrompt}` : ""}`;

    const result = await model.generateContent(prompt);
    let responseText = result.response.text();

    // Clean up markdown block if present (e.g. ```json ... ```)
    responseText = responseText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    // 3. Parse Response
    let aiResponse, citations, disclaimer;
    try {
      const parsed = JSON.parse(responseText);
      aiResponse = parsed.response;
      citations = parsed.citations || [];
      disclaimer = parsed.disclaimer;
    } catch (e) {
      console.warn('Gemini JSON parse failed:', e);
      aiResponse = responseText;
      citations = context ? context.citations : ['Indian Law'];
      disclaimer = 'Disclaimer: AI generated advice. Consult a lawyer.';
    }

    // Save to DB
    const consultation = new Consultation({
      userId: req.user.userId,
      query,
      mode,
      visualData,
      isPremium: user.isPremium,
      aiResponse,
      citations
    });
    await consultation.save();

    user.chatHistory.push({
      query,
      response: aiResponse,
      mode,
      isPremium: user.isPremium,
      citations,
      timestamp: new Date()
    });
    await user.save();

    res.json({
      response: aiResponse,
      citations,
      disclaimer,
      isPremium: user.isPremium
    });

  } catch (error) {
    console.error('Gemini Consultation Error:', error);
    res.status(500).json({
      message: 'Failed to process AI response',
      response: 'Sorry, I am having trouble connecting to the AI service right now. Please try again later.',
      citations: [],
      disclaimer: ''
    });
  }
});

// ==================== PREMIUM & PAYMENT ====================
app.post('/api/user/upgrade-premium', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.userId);
  user.isPremium = true;
  user.premiumExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  await user.save();

  await Payment.create({ userId: req.user.userId, type: 'premium', amount: 2999, status: 'completed', transactionId: 'TXN' + Date.now() });

  res.json({ message: 'Upgraded to premium', isPremium: true });
});

app.post('/api/user/remove-ads', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.userId);
  user.adsRemoved = true;
  await user.save();

  await Payment.create({ userId: req.user.userId, type: 'ads_removal', amount: 199, status: 'completed', transactionId: 'TXN' + Date.now() });

  res.json({ message: 'Ads removed' });
});

// ==================== LAWYER ROUTES ====================
app.get('/api/lawyers', authMiddleware, async (req, res) => {
  const lawyers = await Lawyer.find({ isApproved: true }, { password: 0, emailOtp: 0, phoneOtp: 0 });
  res.json(lawyers);
});

app.get('/api/lawyer/profile', authMiddleware, async (req, res) => {
  const lawyer = await Lawyer.findById(req.user.lawyerId, { password: 0, emailOtp: 0, phoneOtp: 0 });
  res.json(lawyer);
});

app.put('/api/lawyer/profile', authMiddleware, async (req, res) => {
  const updates = req.body;
  const lawyer = await Lawyer.findByIdAndUpdate(req.user.lawyerId, updates, { new: true });
  res.json(lawyer);
});

app.get('/api/lawyer/messages', authMiddleware, async (req, res) => {
  const lawyer = await Lawyer.findById(req.user.lawyerId);
  res.json(lawyer.messages || []);
});

app.post('/api/lawyer/reply', authMiddleware, async (req, res) => {
  const { userId, message } = req.body;
  const lawyer = await Lawyer.findById(req.user.lawyerId);
  const msg = { userId, reply: message, timestamp: new Date(), isRead: false };
  lawyer.messages.push(msg);
  await lawyer.save();
  // Notify user via socket
  io.to(`user_${userId}`).emit('newMessage', { sender: 'lawyer', content: message, timestamp: msg.timestamp });
  res.json({ message: 'Reply sent' });
});

// ==================== ADS ====================
app.get('/api/ads', async (req, res) => {
  const ads = await Ad.find({ isActive: true });
  res.json(ads);
});

// ==================== CONTACT FORM ====================
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    // Send email to company
    await transporter.sendMail({
      from: `"SamvidhanAI Contact" <${process.env.SMTP_USER}>`,
      to: process.env.COMPANY_EMAIL || 'support@samvidhanai.gov.in',
      subject: `Contact Form: ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`,
      html: `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong> ${message}</p>`
    });
    res.json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Contact email error:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

// ==================== START SERVER ====================
const startServer = async () => {
  try {
    await connectDB();
    await initializeAdmin();
    await initializeAds();

    server.listen(PORT, () => {
      console.log(`\n=================================`);
      console.log(`  SamvidhanAI Server Running`);
      console.log(`  Port: ${PORT}`);
      console.log(`  URL: http://localhost:${PORT}`);
      console.log(`=================================\n`);
    });
  } catch (error) {
    console.error('Server startup error:', error);
  }
};

startServer();