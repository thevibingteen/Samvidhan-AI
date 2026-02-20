# SamvidhanAI - (Origin Midnight)

## India's Sovereign AI Legal Assistant Platform

SamvidhanAI is a comprehensive AI-powered LegalTech platform designed to provide Indian citizens with instant legal guidance. Built under the Digital India initiative, it offers a sovereign AI solution trained exclusively on Indian legal corpus.

![SamvidhanAI](https://img.shields.io/badge/SamvidhanAI-Origin%20Midnight-gold)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![MongoDB](https://img.shields.io/badge/MongoDB-5.0+-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## Features

### For Users
- **AI Legal Consultation**: Get instant answers to legal queries
  - Text-based consultation with chat interface
  - Voice assistance (supports Hindi & English)
  - Visual document analysis (upload images/PDFs)
- **Bilingual Support**: Full support for English and Hindi
- **Chat History**: Access past consultations
- **Premium Features**: Detailed case citations, lawyer connections
- **Secure**: OTP-based authentication, data stays in India

### For Lawyers
- **Verified Profile**: Display credentials and expertise
- **Client Management**: Connect with premium users
- **Messaging**: Real-time chat with clients
- **Dashboard**: Track consultations and ratings

### For Admins
- **User Management**: View and manage all users
- **Lawyer Approvals**: Verify and approve lawyer registrations
- **Analytics Dashboard**: View platform statistics
- **Deletion Requests**: Handle account deletion requests

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | HTML5, CSS3, JavaScript (Vanilla) |
| Backend | Node.js, Express.js |
| Database | MongoDB with Mongoose ODM |
| Authentication | JWT (JSON Web Tokens) |
| Password Hashing | bcryptjs |
| AI Integration | Ready for Gemini API / Local Model |

---

## Project Structure

```
samvidhanai/
├── config/
│   └── database.js          # MongoDB connection & schemas
├── middleware/
│   └── auth.js              # JWT authentication middleware
├── public/
│   ├── css/
│   │   ├── style.css        # Landing page styles
│   │   ├── dashboard.css    # User dashboard styles
│   │   ├── admin.css        # Admin dashboard styles
│   │   └── lawyer.css       # Lawyer dashboard styles
│   ├── js/
│   │   ├── main.js          # Landing page logic
│   │   ├── dashboard.js     # User dashboard logic
│   │   ├── admin-dashboard.js # Admin dashboard logic
│   │   └── lawyer-dashboard.js # Lawyer dashboard logic
│   ├── index.html           # Landing page
│   ├── dashboard.html       # User dashboard
│   ├── admin-dashboard.html # Admin dashboard
│   └── lawyer-dashboard.html # Lawyer dashboard
├── routes/
│   └── api.js               # API routes
├── server.js                # Main server file
├── package.json
└── README.md
```

---

## Installation

### Prerequisites
- Node.js 18+ installed
- MongoDB 5.0+ installed and running locally

### Step 1: Clone and Navigate
```bash
cd samvidhanai
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Start MongoDB
Ensure MongoDB is running on your local machine:
```bash
# Windows (if MongoDB is installed as a service)
net start MongoDB

# Linux/macOS
sudo systemctl start mongod
```

### Step 4: Start the Server
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

### Step 5: Access the Application
Open your browser and navigate to:
```
http://localhost:3000
```

---

## Default Credentials

### Admin Login
- **Username**: `samvidhan`
- **Password**: `samvidhanai`

### Demo OTP
For testing purposes, use OTP: `123456` for both email and phone verification.

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/user/signup` | Register new user |
| POST | `/api/user/login` | User login |
| POST | `/api/user/verify-otp` | Verify OTP |
| POST | `/api/lawyer/signup` | Register new lawyer |
| POST | `/api/lawyer/login` | Lawyer login |
| POST | `/api/admin/login` | Admin login |

### User Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/user/profile` | Get user profile |
| POST | `/api/user/consult` | AI consultation |
| GET | `/api/user/history` | Get chat history |
| POST | `/api/user/upgrade` | Upgrade to premium |
| POST | `/api/user/change-password` | Change password |
| POST | `/api/user/request-deletion` | Request account deletion |

### Admin Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Get platform statistics |
| GET | `/api/admin/users` | Get all users |
| GET | `/api/admin/lawyers` | Get all lawyers |
| POST | `/api/admin/approve-lawyer/:id` | Approve lawyer |
| POST | `/api/admin/reject-lawyer/:id` | Reject lawyer |
| GET | `/api/admin/deletion-requests` | Get deletion requests |
| POST | `/api/admin/approve-deletion/:id` | Approve deletion |

---

## AI Integration

### Current Implementation
The platform includes a mock AI service that simulates legal responses. For production deployment:

### Option 1: Google Gemini API
1. Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Add to environment variables:
```bash
export GEMINI_API_KEY=your_api_key_here
```
3. Uncomment the Gemini integration code in `server.js`

### Option 2: Local AI Model (Bharat Gen AI Legal Param)
1. Set up the local model server
2. Configure the endpoint in `server.js`:
```javascript
const LOCAL_AI_URL = 'http://localhost:8000/generate';
```

---

## Database Schema

### User Schema
```javascript
{
  fullName: String,
  email: String (unique),
  phone: String (unique),
  password: String (hashed),
  isVerified: Boolean,
  isPremium: Boolean,
  consentGiven: Boolean,
  deletionRequested: Boolean,
  chatHistory: Array,
  createdAt: Date
}
```

### Lawyer Schema
```javascript
{
  fullName: String,
  email: String (unique),
  phone: String (unique),
  barCouncilNumber: String,
  password: String (hashed),
  isVerified: Boolean,
  isApproved: Boolean,
  createdAt: Date
}
```

---

## Responsive Design

The platform is fully responsive and optimized for:
- Desktop (1200px+)
- Tablet (768px - 1199px)
- Mobile (< 768px)

Key responsive features:
- Collapsible sidebar on mobile
- Touch-friendly interface
- Optimized chat experience
- Adaptive navigation

---

## Security Features

- JWT-based authentication
- bcryptjs password hashing
- OTP verification for signup
- Data sovereignty (local MongoDB)
- CORS protection
- Input validation

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## Support

For support, email support@samvidhanai.gov.in or call the helpline: 1800-XXX-XXXX

---

## Acknowledgments

- Ministry of Law and Justice, Government of India
- Digital India Initiative
- Bharat Gen AI Legal Param Project

---

**Made with for India** 🇮🇳
