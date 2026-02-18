// main.js – Authentication Helper and Global Functions

const API_BASE = window.location.origin;

// ==================== AUTH HELPER ====================
class AuthHelper {
  static getToken() { return localStorage.getItem('token'); }
  static getUserRole() { return localStorage.getItem('userRole'); }
  static getUser() { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; }
  static getLawyer() { const l = localStorage.getItem('lawyer'); return l ? JSON.parse(l) : null; }
  static isAuthenticated() { return !!this.getToken(); }
  static isPremium() { const u = this.getUser(); return u?.isPremium || false; }

  static async apiRequest(endpoint, options = {}) {
    const token = this.getToken();
    const headers = { 'Content-Type': 'application/json', ...(token && { 'Authorization': `Bearer ${token}` }) };
    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    return response;
  }

  static async getProfile() {
    const role = this.getUserRole();
    const endpoint = role === 'user' ? '/api/user/profile' : '/api/lawyer/profile';
    const res = await this.apiRequest(endpoint);
    return res.ok ? await res.json() : null;
  }

  static async updateProfile(data) {
    const role = this.getUserRole();
    const endpoint = role === 'user' ? '/api/user/profile' : '/api/lawyer/profile';
    const res = await this.apiRequest(endpoint, { method: 'PUT', body: JSON.stringify(data) });
    return res.ok;
  }

  static async changePassword(currentPassword, newPassword) {
    const reqRes = await this.apiRequest('/api/user/change-password-request', { method: 'POST' });
    if (!reqRes.ok) return false;
    const { otp } = await reqRes.json();
    const userOtp = prompt('Enter OTP sent to your email:');
    if (!userOtp) return false;
    const verifyRes = await this.apiRequest('/api/user/change-password-verify', {
      method: 'POST',
      body: JSON.stringify({ otp: userOtp, newPassword })
    });
    return verifyRes.ok;
  }

  static async forgotPassword(email) {
    const res = await fetch(`${API_BASE}/api/user/forgot-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return res.ok ? await res.json() : null;
  }

  static async resetPassword(email, otp, newPassword) {
    const res = await fetch(`${API_BASE}/api/user/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, newPassword })
    });
    return res.ok;
  }

  static async requestAccountDeletion() {
    const res = await this.apiRequest('/api/user/request-deletion', { method: 'POST' });
    return res.ok;
  }

  static async upgradeToPremium() {
    const res = await this.apiRequest('/api/user/upgrade-premium', { method: 'POST' });
    if (res.ok) {
      const user = this.getUser();
      if (user) { user.isPremium = true; localStorage.setItem('user', JSON.stringify(user)); }
      return true;
    }
    return false;
  }

  static async removeAds() {
    const res = await this.apiRequest('/api/user/remove-ads', { method: 'POST' });
    if (res.ok) {
      const user = this.getUser();
      if (user) { user.adsRemoved = true; localStorage.setItem('user', JSON.stringify(user)); }
      return true;
    }
    return false;
  }

  static async getChatHistory() {
    const res = await this.apiRequest('/api/user/chat-history');
    return res.ok ? await res.json() : [];
  }

  static async sendConsultation(query, mode = 'text', visualData = null) {
    const res = await this.apiRequest('/api/consultation', {
      method: 'POST',
      body: JSON.stringify({ query, mode, visualData })
    });
    return res.ok ? await res.json() : null;
  }

  static async getLawyers() {
    const res = await this.apiRequest('/api/lawyers');
    return res.ok ? await res.json() : [];
  }

  static async getAds() {
    const res = await fetch(`${API_BASE}/api/ads`);
    return res.ok ? await res.json() : [];
  }
}

// ==================== ADMIN HELPER ====================
class AdminHelper {
  static async login(username, password) {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('token', data.token);
      localStorage.setItem('userRole', 'admin');
      return data;
    }
    return null;
  }

  static async getPendingLawyers() {
    const res = await AuthHelper.apiRequest('/api/admin/pending-lawyers');
    return res.ok ? await res.json() : [];
  }

  static async approveLawyer(lawyerId) {
    const res = await AuthHelper.apiRequest(`/api/admin/approve-lawyer/${lawyerId}`, { method: 'POST' });
    return res.ok;
  }

  static async getAllUsers() {
    const res = await AuthHelper.apiRequest('/api/admin/users');
    return res.ok ? await res.json() : [];
  }

  static async getAllLawyers() {
    const res = await AuthHelper.apiRequest('/api/admin/lawyers');
    return res.ok ? await res.json() : [];
  }

  static async approveDeletion(userId, type = 'user') {
    const res = await AuthHelper.apiRequest(`/api/admin/approve-deletion/${userId}`, {
      method: 'POST', body: JSON.stringify({ type })
    });
    return res.ok;
  }
}

// ==================== LAWYER HELPER ====================
class LawyerHelper {
  static async getMessages() {
    const res = await AuthHelper.apiRequest('/api/lawyer/messages');
    return res.ok ? await res.json() : [];
  }

  static async replyToUser(userId, message) {
    const res = await AuthHelper.apiRequest('/api/lawyer/reply', {
      method: 'POST', body: JSON.stringify({ userId, message })
    });
    return res.ok;
  }

  static async updateProfile(data) {
    const res = await AuthHelper.apiRequest('/api/lawyer/profile', {
      method: 'PUT', body: JSON.stringify(data)
    });
    return res.ok;
  }
}

// ==================== UTILITY FUNCTIONS ====================
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  if (toast && toastMessage) {
    toastMessage.textContent = message;
    toast.className = `toast ${type} active`;
    setTimeout(() => toast.classList.remove('active'), 3000);
  }
}

function showLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('active');
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.remove('active');
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== YOUTUBE MODAL ====================
function openVideoModal(videoId) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content modal-lg" style="background: black; padding:0;">
      <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
      <iframe width="100%" height="400" src="https://www.youtube.com/embed/${videoId}?autoplay=1" frameborder="0" allowfullscreen></iframe>
    </div>
  `;
  document.body.appendChild(modal);
}

// ==================== LANGUAGE ====================
const translations = {
  en: {
    'Home': 'Home', 'About': 'About', 'Features': 'Features', 'How It Works': 'How It Works',
    'Pricing': 'Pricing', 'Contact': 'Contact', 'Login': 'Login', 'Sign Up': 'Sign Up',
    'Welcome Back': 'Welcome Back', 'Create Account': 'Create Account',
    'Email': 'Email', 'Password': 'Password', 'Full Name': 'Full Name',
    'Phone Number': 'Phone Number', 'Verify': 'Verify', 'Send': 'Send',
    'Logout': 'Logout', 'Dashboard': 'Dashboard', 'Consultation': 'Consultation',
    'History': 'History', 'Lawyers': 'Lawyers', 'Settings': 'Settings',
    'Text': 'Text', 'Voice': 'Voice', 'Visual': 'Visual',
    'Type your legal query here...': 'Type your legal query here...',
    'Welcome to SamvidhanAI': 'Welcome to SamvidhanAI',
    'I am your AI legal assistant. Ask me any legal question in English or Hindi.':
      'I am your AI legal assistant. Ask me any legal question in English or Hindi.',
    'Processing...': 'Processing...'
  },
  hi: {
    'Home': 'होम', 'About': 'परिचय', 'Features': 'विशेषताएं', 'How It Works': 'कैसे काम करता है',
    'Pricing': 'मूल्य निर्धारण', 'Contact': 'संपर्क', 'Login': 'लॉगिन', 'Sign Up': 'साइन अप',
    'Welcome Back': 'वापसी पर स्वागत है', 'Create Account': 'खाता बनाएं',
    'Email': 'ईमेल', 'Password': 'पासवर्ड', 'Full Name': 'पूरा नाम',
    'Phone Number': 'फोन नंबर', 'Verify': 'सत्यापित करें', 'Send': 'भेजें',
    'Logout': 'लॉगआउट', 'Dashboard': 'डैशबोर्ड', 'Consultation': 'परामर्श',
    'History': 'इतिहास', 'Lawyers': 'वकील', 'Settings': 'सेटिंग्स',
    'Text': 'टेक्स्ट', 'Voice': 'वॉयस', 'Visual': 'दृश्य',
    'Type your legal query here...': 'अपना कानूनी प्रश्न यहां टाइप करें...',
    'Welcome to SamvidhanAI': 'सम्विधानAI में आपका स्वागत है',
    'I am your AI legal assistant. Ask me any legal question in English or Hindi.':
      'मैं आपका AI कानूनी सहायक हूं। मुझसे अंग्रेजी या हिंदी में कोई भी कानूनी सवाल पूछें।',
    'Processing...': 'प्रसंस्करण...'
  }
};

let currentLanguage = localStorage.getItem('language') || 'en';

function setLanguage(lang) {
  currentLanguage = lang;
  localStorage.setItem('language', lang);
  document.querySelectorAll('[data-en]').forEach(el => {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = el.getAttribute(`data-${lang}`) || el.placeholder;
    } else {
      el.textContent = el.getAttribute(`data-${lang}`) || el.textContent;
    }
  });
  // Update active language buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `lang-${lang}`);
  });
  document.documentElement.lang = lang;
}

// ==================== LOGOUT ====================
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userRole');
  localStorage.removeItem('user');
  localStorage.removeItem('lawyer');
  showToast('Logged out successfully');
  setTimeout(() => window.location.href = '/', 1000);
}

// ==================== ROUTE GUARD ====================
function requireAuth(roles = ['user']) {
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('userRole');

  if (!token) {
    window.location.href = '/?login=required';
    return false;
  }

  if (!roles.includes(userRole)) {
    window.location.href = '/?unauthorized=true';
    return false;
  }

  return true;
}

// ==================== EXPORTS ====================
window.AuthHelper = AuthHelper;
window.AdminHelper = AdminHelper;
window.LawyerHelper = LawyerHelper;
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.openModal = openModal;
window.closeModal = closeModal;
window.setLanguage = setLanguage;
window.logout = logout;
window.requireAuth = requireAuth;
window.escapeHtml = escapeHtml;
window.openVideoModal = openVideoModal;

// ==================== EVENT LISTENERS FOR LANDING PAGE ====================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize language
  setLanguage(currentLanguage);

  // Language toggle
  document.getElementById('lang-en')?.addEventListener('click', () => setLanguage('en'));
  document.getElementById('lang-hi')?.addEventListener('click', () => setLanguage('hi'));

  // Login modal triggers
  document.getElementById('loginBtn')?.addEventListener('click', () => openModal('loginModal'));
  document.getElementById('signupBtn')?.addEventListener('click', () => openModal('signupModal'));
  document.getElementById('heroSignupBtn')?.addEventListener('click', () => openModal('signupModal'));

  // Watch demo button
  document.getElementById('learnMoreBtn')?.addEventListener('click', () => openVideoModal('YOUR_VIDEO_ID')); // Replace with actual YouTube video ID

  // Skip to main content
  document.querySelector('.skip-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('main-content')?.focus();
  });

  // Close modals
  document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-close') || e.target.classList.contains('modal-overlay')) {
        const modal = e.target.closest('.modal');
        if (modal) modal.classList.remove('active');
      }
    });
  });

  // Login tabs
  document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      const parent = tab.closest('.modal');
      if (!parent) return;
      const tabContainer = tab.parentNode;
      tabContainer.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const targetId = tab.dataset.tab + '-form';
      parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const target = parent.querySelector('#' + targetId);
      if (target) target.classList.add('active');
    });
  });

  // Modal switches
  document.getElementById('show-signup')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal('loginModal');
    openModal('signupModal');
  });
  document.getElementById('show-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal('signupModal');
    openModal('loginModal');
  });

  // Forgot password link
  document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal('forgotPasswordModal');
  });

  // Back to login from forgot password
  document.getElementById('back-to-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal('forgotPasswordModal');
    openModal('loginModal');
  });

  // Form submissions
  document.getElementById('userLoginForm')?.addEventListener('submit', handleUserLogin);
  document.getElementById('lawyerLoginForm')?.addEventListener('submit', handleLawyerLogin);
  document.getElementById('adminLoginForm')?.addEventListener('submit', handleAdminLogin);
  document.getElementById('userSignupForm')?.addEventListener('submit', handleUserSignup);
  document.getElementById('lawyerSignupForm')?.addEventListener('submit', handleLawyerSignup);
  document.getElementById('otpForm')?.addEventListener('submit', handleOtpVerification);
  document.getElementById('forgotPasswordForm')?.addEventListener('submit', handleForgotPassword);
  document.getElementById('resetPasswordForm')?.addEventListener('submit', handleResetPassword);
  document.getElementById('contactForm')?.addEventListener('submit', handleContactForm);

  // Consent
  document.getElementById('accept-consent')?.addEventListener('click', handleConsentAccept);
  document.getElementById('decline-consent')?.addEventListener('click', handleConsentDecline);
  document.getElementById('consentCheckbox')?.addEventListener('change', (e) => {
    document.getElementById('accept-consent').disabled = !e.target.checked;
  });
});

// ==================== FORM HANDLERS ====================
let pendingSignup = null;

async function handleUserLogin(e) {
  e.preventDefault();
  showLoading();

  const email = document.getElementById('user-login-email').value;
  const password = document.getElementById('user-login-password').value;

  try {
    const response = await fetch('/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('userRole', 'user');
      localStorage.setItem('user', JSON.stringify(data.user));
      showToast('Login successful!');
      closeModal('loginModal');

      if (!data.user.consentGiven) {
        setTimeout(() => openModal('consentModal'), 500);
      } else {
        setTimeout(() => window.location.href = '/dashboard.html', 1000);
      }
    } else {
      showToast(data.message || 'Login failed', 'error');
    }
  } catch (error) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    hideLoading();
  }
}

async function handleLawyerLogin(e) {
  e.preventDefault();
  showLoading();

  const email = document.getElementById('lawyer-login-email').value;
  const password = document.getElementById('lawyer-login-password').value;

  try {
    const response = await fetch('/api/lawyer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('userRole', 'lawyer');
      localStorage.setItem('lawyer', JSON.stringify(data.lawyer));
      showToast('Login successful!');
      closeModal('loginModal');
      setTimeout(() => window.location.href = '/lawyer-dashboard.html', 1000);
    } else {
      showToast(data.message || 'Login failed', 'error');
    }
  } catch (error) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    hideLoading();
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  showLoading();

  const username = document.getElementById('admin-username').value;
  const password = document.getElementById('admin-password').value;

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('userRole', 'admin');
      showToast('Admin login successful!');
      closeModal('loginModal');
      setTimeout(() => window.location.href = '/admin-dashboard.html', 1000);
    } else {
      showToast(data.message || 'Login failed', 'error');
    }
  } catch (error) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    hideLoading();
  }
}

async function handleUserSignup(e) {
  e.preventDefault();
  showLoading();

  const fullName = document.getElementById('user-signup-name').value;
  const email = document.getElementById('user-signup-email').value;
  const phone = document.getElementById('user-signup-phone').value;
  const password = document.getElementById('user-signup-password').value;
  const confirmPassword = document.getElementById('user-signup-confirm').value;

  if (password !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    hideLoading();
    return;
  }

  try {
    const response = await fetch('/api/user/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, phone, password })
    });

    const data = await response.json();

    if (response.ok) {
      pendingSignup = { userId: data.userId, type: 'user' };
      closeModal('signupModal');
      openModal('otpModal');
      showToast('OTP sent! Check console for OTPs.');
      document.getElementById('email-otp').value = data.emailOtp || '';
      document.getElementById('phone-otp').value = data.phoneOtp || '';
    } else {
      showToast(data.message || 'Signup failed', 'error');
    }
  } catch (error) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    hideLoading();
  }
}

async function handleLawyerSignup(e) {
  e.preventDefault();
  showLoading();

  const fullName = document.getElementById('lawyer-signup-name').value;
  const email = document.getElementById('lawyer-signup-email').value;
  const phone = document.getElementById('lawyer-signup-phone').value;
  const barCouncilNumber = document.getElementById('lawyer-signup-bar').value;
  const aadhaarNumber = document.getElementById('lawyer-signup-aadhaar').value;  // NEW
  const specialization = document.getElementById('lawyer-signup-specialization').value;
  const experience = document.getElementById('lawyer-signup-experience').value;
  const courtJurisdiction = document.getElementById('lawyer-signup-court').value;
  const address = document.getElementById('lawyer-signup-address').value;
  const bio = document.getElementById('lawyer-signup-bio').value;
  const password = document.getElementById('lawyer-signup-password').value;
  const confirmPassword = document.getElementById('lawyer-signup-confirm').value;

  if (password !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    hideLoading();
    return;
  }

  try {
    const response = await fetch('/api/lawyer/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName, email, phone, barCouncilNumber, aadhaarNumber, specialization,
        experience, courtJurisdiction, address, bio, password
      })
    });

    const data = await response.json();

    if (response.ok) {
      pendingSignup = { lawyerId: data.lawyerId, type: 'lawyer' };
      closeModal('signupModal');
      openModal('otpModal');
      showToast('OTP sent! Check console for OTPs.');
      document.getElementById('email-otp').value = data.emailOtp || '';
      document.getElementById('phone-otp').value = data.phoneOtp || '';
    } else {
      showToast(data.message || 'Signup failed', 'error');
    }
  } catch (error) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    hideLoading();
  }
}

async function handleOtpVerification(e) {
  e.preventDefault();
  showLoading();

  const emailOtp = document.getElementById('email-otp').value;
  const phoneOtp = document.getElementById('phone-otp').value;

  if (!pendingSignup) {
    showToast('Session expired. Please signup again.', 'error');
    hideLoading();
    return;
  }

  const endpoint = pendingSignup.type === 'user' ? '/api/user/verify-otp' : '/api/lawyer/verify-otp';
  const idField = pendingSignup.type === 'user' ? 'userId' : 'lawyerId';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        [idField]: pendingSignup[idField],
        emailOtp,
        phoneOtp
      })
    });

    const data = await response.json();

    if (response.ok) {
      closeModal('otpModal');
      showToast('Verification successful!');

      if (pendingSignup.type === 'user') {
        localStorage.setItem('token', data.token);
        localStorage.setItem('userRole', 'user');
        localStorage.setItem('user', JSON.stringify(data.user));
        setTimeout(() => openModal('consentModal'), 500);
      } else {
        showToast('Registration successful! Awaiting admin approval.');
        setTimeout(() => window.location.href = '/', 2000);
      }

      pendingSignup = null;
    } else {
      showToast(data.message || 'Verification failed', 'error');
    }
  } catch (error) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    hideLoading();
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  showLoading();
  const email = document.getElementById('forgot-email').value;
  const result = await AuthHelper.forgotPassword(email);
  if (result) {
    showToast('OTP sent to your email');
    closeModal('forgotPasswordModal');
    openModal('resetPasswordModal');
    document.getElementById('reset-email').value = email;
  } else {
    showToast('Failed to send OTP', 'error');
  }
  hideLoading();
}

async function handleResetPassword(e) {
  e.preventDefault();
  showLoading();
  const email = document.getElementById('reset-email').value;
  const otp = document.getElementById('reset-otp').value;
  const newPass = document.getElementById('reset-new-password').value;
  const confirm = document.getElementById('reset-confirm-password').value;
  if (newPass !== confirm) {
    showToast('Passwords do not match', 'error');
    hideLoading();
    return;
  }
  const ok = await AuthHelper.resetPassword(email, otp, newPass);
  if (ok) {
    showToast('Password reset successful. Please login.');
    closeModal('resetPasswordModal');
  } else {
    showToast('Reset failed', 'error');
  }
  hideLoading();
}

async function handleConsentAccept() {
  showLoading();

  try {
    const response = await AuthHelper.apiRequest('/api/user/consent', { method: 'POST' });

    if (response.ok) {
      closeModal('consentModal');
      showToast('Welcome to SamvidhanAI!');
      setTimeout(() => window.location.href = '/dashboard.html', 1000);
    } else {
      showToast('Failed to record consent', 'error');
    }
  } catch (error) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    hideLoading();
  }
}

function handleConsentDecline() {
  closeModal('consentModal');
  showToast('You can accept terms later from your dashboard');
  setTimeout(() => window.location.href = '/dashboard.html', 1000);
}

async function handleContactForm(e) {
  e.preventDefault();
  showLoading();
  const name = document.getElementById('contactName').value;
  const email = document.getElementById('contactEmail').value;
  const subject = document.getElementById('contactSubject').value;
  const message = document.getElementById('contactMessage').value;

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, subject, message })
    });
    if (res.ok) {
      showToast('Message sent!');
      document.getElementById('contactForm').reset();
    } else {
      showToast('Failed to send', 'error');
    }
  } catch (error) {
    showToast('Network error', 'error');
  } finally {
    hideLoading();
  }
}