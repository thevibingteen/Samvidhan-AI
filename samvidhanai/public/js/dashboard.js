// dashboard.js – User Dashboard

if (!requireAuth('user')) {
  // redirect handled in function
}

let currentMode = 'text';
let isRecording = false;
let recognition = null;
let currentFile = null;
let socket = null;
// NOTE: currentLanguage, showLoading, hideLoading are defined in main.js (loaded first)

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM loaded, initializing dashboard...');
  try {
    initializeEventListeners();
    initializeSpeechRecognition();
    await loadUserData();
    await loadChatHistory();
    await loadAds();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('upgrade') === 'premium') {
      switchSection('premium');
    } else if (urlParams.get('upgrade') === 'ads') {
      removeAds();
    }

    // Initialize Socket.io for lawyer chat
    const token = AuthHelper.getToken();
    if (token && typeof io !== 'undefined') {
      socket = io({ auth: { token } });
      socket.on('connect', () => {
        const user = AuthHelper.getUser();
        if (user) socket.emit('join', { userId: user.id });
      });
      socket.on('newMessage', (msg) => {
        const chatModal = document.getElementById('lawyerChatModal');
        if (chatModal && chatModal.classList.contains('active')) {
          addMessageToChatModal(msg);
        }
        showToast('New message from lawyer', 'info');
      });
    } else if (typeof io === 'undefined') {
      console.warn('Socket.io not loaded');
    }
  } catch (error) {
    console.error('Initialization error:', error);
    hideLoading();
    showToast('Failed to initialize dashboard', 'error');
  }
});

function initializeEventListeners() {
  console.log('Initializing event listeners');

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault(); // Prevent default anchor behavior
      const section = item.dataset.section;
      if (section) switchSection(section);
    });
  });

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof logout === 'function') {
        logout();
      } else {
        console.error('Logout function not found');
        // Fallback logout
        localStorage.clear();
        window.location.href = '/';
      }
    });
  }

  // Mode tabs
  document.querySelectorAll('.mode-btn').forEach(tab => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  });

  // Text input
  const sendTextBtn = document.getElementById('sendTextBtn');
  const textQuery = document.getElementById('textQuery');
  if (sendTextBtn) sendTextBtn.addEventListener('click', sendTextQuery);
  if (textQuery) {
    textQuery.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextQuery();
      }
    });
  }

  // Voice
  const voiceBtn = document.getElementById('voiceRecordBtn');
  if (voiceBtn) voiceBtn.addEventListener('click', toggleVoiceRecording);

  // Visual upload
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const removeFileBtn = document.getElementById('remove-file');
  const sendVisualBtn = document.getElementById('sendVisualBtn');

  if (uploadZone) uploadZone.addEventListener('click', () => fileInput?.click());
  if (fileInput) fileInput.addEventListener('change', handleFileSelect);
  if (removeFileBtn) removeFileBtn.addEventListener('click', removeSelectedFile);
  if (sendVisualBtn) sendVisualBtn.addEventListener('click', sendVisualQuery);

  // Password change
  const passwordForm = document.getElementById('passwordForm');
  if (passwordForm) passwordForm.addEventListener('submit', handlePasswordChange);

  // Upgrade buttons
  const upgradeAdBtn = document.getElementById('upgradeAdBtn');
  const upgradeLawyerBtn = document.getElementById('upgradeLawyerBtn');
  if (upgradeAdBtn) upgradeAdBtn.addEventListener('click', () => switchSection('premium'));
  if (upgradeLawyerBtn) upgradeLawyerBtn.addEventListener('click', () => switchSection('premium'));

  // Premium plan selection
  const monthlyBtn = document.getElementById('monthlyPlanBtn');
  const yearlyBtn = document.getElementById('yearlyPlanBtn');
  if (monthlyBtn) monthlyBtn.addEventListener('click', () => processUpgrade('monthly'));
  if (yearlyBtn) yearlyBtn.addEventListener('click', () => processUpgrade('yearly'));

  // Lawyer chat modal
  const closeChatBtn = document.getElementById('closeChatModal');
  const sendMsgBtn = document.getElementById('sendMessageBtn');
  const chatInput = document.getElementById('chatInput');

  if (closeChatBtn) closeChatBtn.addEventListener('click', closeChatModal);
  if (sendMsgBtn) sendMsgBtn.addEventListener('click', sendMessage);
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  // Delete account
  const deleteBtn = document.getElementById('deleteAccountBtn');
  if (deleteBtn) deleteBtn.addEventListener('click', requestDeletion);

  // Settings tabs
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
      const panelId = tab.dataset.tab + '-panel';
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.add('active');
    });
  });

  // Language preference
  document.querySelectorAll('.lang-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      setLanguage(lang);
      document.querySelectorAll('.lang-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Suggestion chip click handlers
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const query = currentLanguage === 'hi'
        ? (chip.dataset.hiQuery || chip.dataset.query)
        : chip.dataset.query;
      if (query) {
        const textQueryEl = document.getElementById('textQuery');
        if (textQueryEl) {
          textQueryEl.value = query;
          switchMode('text');
          sendTextQuery();
        }
      }
    });
  });
}

function initializeSpeechRecognition() {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false; // Auto-stop on silence to send query
    recognition.interimResults = true;
    // Support both Hindi and English
    recognition.lang = currentLanguage === 'hi' ? 'hi-IN' : 'en-IN';

    let finalTranscript = '';

    recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      const voiceTranscript = document.getElementById('voiceTranscript');
      if (voiceTranscript) {
        voiceTranscript.innerHTML = `<span class="final">${finalTranscript}</span><span class="interim">${interimTranscript}</span>`;
      }
    };

    recognition.onend = () => {
      if (isRecording) {
        // Auto-stopped by browser — get the final transcript and send it
        isRecording = false;
        updateVoiceUI();
        const transcript = finalTranscript.trim();
        finalTranscript = '';
        if (transcript) {
          sendVoiceQuery(transcript);
        }
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      isRecording = false;
      updateVoiceUI();
      // User-friendly error messages
      let errorMsg = 'Voice recognition error';
      switch (event.error) {
        case 'no-speech': errorMsg = 'No speech detected. Please try again.'; break;
        case 'audio-capture': errorMsg = 'No microphone found. Please check your device.'; break;
        case 'not-allowed': errorMsg = 'Microphone permission denied.'; break;
        case 'network': errorMsg = 'Network error. Please check your connection.'; break;
        default: errorMsg = 'Voice error: ' + event.error;
      }
      showToast(errorMsg, 'error');
    };

    // Store finalTranscript in closure for access
    recognition._getFinalTranscript = () => { const t = finalTranscript.trim(); finalTranscript = ''; return t; };
  } else {
    console.warn('Speech recognition not supported in this browser');
  }
}

function toggleVoiceRecording() {
  if (!recognition) {
    showToast('Voice recognition is not supported in your browser. Please use Chrome.', 'error');
    return;
  }

  if (isRecording) {
    recognition.stop();
    isRecording = false;
    updateVoiceUI();
    // Transcript is handled in recognition.onend
  } else {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        // Set language based on current preference
        recognition.lang = currentLanguage === 'hi' ? 'hi-IN' : 'en-IN';
        const voiceTranscript = document.getElementById('voiceTranscript');
        if (voiceTranscript) voiceTranscript.innerHTML = '';
        try {
          recognition.start();
          isRecording = true;
          updateVoiceUI();
        } catch (e) {
          console.error('Recognition start error:', e);
          showToast('Could not start voice recognition. Try again.', 'error');
        }
      })
      .catch(err => {
        showToast('Microphone permission denied. Please allow microphone access.', 'error');
        console.error('Mic error:', err);
      });
  }
}

function updateVoiceUI() {
  const btn = document.getElementById('voiceRecordBtn');
  const status = document.getElementById('voiceStatus');
  const visualizer = document.getElementById('voiceWave');

  if (isRecording) {
    btn?.classList.add('recording');
    if (status) status.innerHTML = '<i class="fas fa-circle" style="color:#e53e3e;animation:pulse 1s infinite"></i> <span>Listening... Speak in Hindi or English</span>';
    visualizer?.classList.add('active');
  } else {
    btn?.classList.remove('recording');
    if (status) status.innerHTML = '<i class="fas fa-microphone"></i> <span>Tap to start recording</span>';
    visualizer?.classList.remove('active');
  }
}

function switchSection(section) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });
  document.querySelectorAll('.section').forEach(sec => {
    sec.classList.toggle('active', sec.id === section + '-section');
  });
}

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });
  document.querySelectorAll('.input-mode').forEach(panel => {
    panel.classList.toggle('active', panel.id === mode + '-input');
  });
}

async function loadUserData() {
  showLoading();
  try {
    const user = await AuthHelper.getProfile();
    if (!user) {
      throw new Error('Failed to load user profile');
    }

    // Sidebar user info
    const userNameSpan = document.getElementById('userName');
    const userAvatarDiv = document.getElementById('userAvatar');
    const userPlanSpan = document.getElementById('userPlan');
    if (userNameSpan) userNameSpan.textContent = user.fullName || 'User';
    if (userAvatarDiv) userAvatarDiv.textContent = (user.fullName || 'U').charAt(0);
    if (userPlanSpan) userPlanSpan.textContent = user.isPremium ? '⭐ Premium Plan' : 'Free Plan';

    // Profile settings (readonly)
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profilePhone = document.getElementById('profilePhone');
    const profilePlan = document.getElementById('profilePlan');

    if (profileName) profileName.value = user.fullName || '';
    if (profileEmail) profileEmail.value = user.email || '';
    if (profilePhone) profilePhone.value = user.phone || '';
    if (profilePlan) profilePlan.value = user.isPremium ? 'Premium' : 'Free';

    // Premium nav & section visibility
    const premiumNavItem = document.getElementById('premiumNavItem');
    const premiumSection = document.getElementById('premium-section');
    const lawyersGate = document.getElementById('lawyersGate');
    const lawyersGrid = document.getElementById('lawyersGrid');

    if (user.isPremium) {
      // Hide Premium option from sidebar for premium users
      if (premiumNavItem) premiumNavItem.style.display = 'none';
      if (premiumSection) premiumSection.innerHTML = '<div class="premium-hero"><div class="premium-badge"><i class="fas fa-crown"></i></div><h3>You are a Premium Member! 🎉</h3><p>Enjoy unlimited AI consultations, lawyer connections, and ad-free experience.</p></div>';

      // Show lawyers grid
      if (lawyersGate) lawyersGate.style.display = 'none';
      if (lawyersGrid) {
        lawyersGrid.style.display = 'grid';
        await loadLawyers();
      }
    } else {
      if (premiumNavItem) premiumNavItem.style.display = '';
      if (lawyersGate) lawyersGate.style.display = 'flex';
      if (lawyersGrid) lawyersGrid.style.display = 'none';
    }

    // Ads
    const adBanner = document.getElementById('adBanner');
    if (adBanner && (user.adsRemoved || user.isPremium)) {
      adBanner.style.display = 'none';
    }
  } catch (error) {
    console.error('Error loading user data:', error);
    showToast('Failed to load user data', 'error');
  } finally {
    hideLoading();
  }
}

async function sendTextQuery() {
  const query = document.getElementById('textQuery').value.trim();
  if (!query) return;

  addMessageToChat('user', query);
  document.getElementById('textQuery').value = '';

  // Show typing indicator in chat
  const typingId = showTypingIndicator();

  try {
    const result = await AuthHelper.sendConsultation(query, 'text');
    removeTypingIndicator(typingId);
    if (result) {
      addMessageToChat('ai', result.response, result.citations, result.disclaimer);
    } else {
      addMessageToChat('ai', 'Sorry, I could not process your query. Please try again.');
      showToast('Failed to get response', 'error');
    }
  } catch (error) {
    removeTypingIndicator(typingId);
    addMessageToChat('ai', 'A network error occurred. Please check your connection and try again.');
    showToast('Network error', 'error');
    console.error(error);
  }
}

async function sendVoiceQuery(transcript) {
  if (!transcript.trim()) return;

  // Show the voice transcript in chat
  addMessageToChat('user', transcript);
  const typingId = showTypingIndicator();

  try {
    const result = await AuthHelper.sendConsultation(transcript, 'voice');
    removeTypingIndicator(typingId);
    if (result) {
      addMessageToChat('ai', result.response, result.citations, result.disclaimer);
      speakText(result.response);
    } else {
      addMessageToChat('ai', 'Sorry, I could not process your voice query. Please try again.');
      showToast('Failed to get response', 'error');
    }
  } catch (error) {
    removeTypingIndicator(typingId);
    addMessageToChat('ai', 'A network error occurred. Please try again.');
    showToast('Network error', 'error');
    console.error(error);
  }
}

function addMessageToChat(sender, content, citations, disclaimer) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const welcome = container.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${sender}`;
  const avatar = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let contentHtml = '';
  if (sender === 'ai') {
    // Format AI response with markdown-like rendering
    const formattedText = formatAIResponse(content);
    contentHtml = `<div class="ai-response-text">${formattedText}</div>`;

    // Add citations block
    if (citations && citations.length > 0) {
      contentHtml += `
        <div class="ai-citations">
          <div class="citations-header"><i class="fas fa-bookmark"></i> Legal References</div>
          <ul class="citations-list">
            ${citations.map(c => `<li><i class="fas fa-gavel"></i> ${escapeHtml(c)}</li>`).join('')}
          </ul>
        </div>`;
    }

    // Add disclaimer
    if (disclaimer) {
      contentHtml += `
        <div class="ai-disclaimer">
          <p>${escapeHtml(disclaimer)}</p>
        </div>`;
    }
  } else {
    contentHtml = `<p>${escapeHtml(content)}</p>`;
  }

  messageDiv.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">${contentHtml}<span class="message-time">${time}</span></div>
  `;
  container.appendChild(messageDiv);
  container.scrollTop = container.scrollHeight;
}

function formatAIResponse(text) {
  if (!text) return '';

  // Detect if the text is a raw JSON string (failsafe for server-side parse failures)
  let content = text;
  if (content.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.response) content = parsed.response;
    } catch (e) { /* use raw */ }
  }

  let html = escapeHtml(content);
  // Headers: ### text -> <h4>text</h4>
  html = html.replace(/^###\s+(.*)$/gm, '<h4>$1</h4>');
  // Bold: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Numbered lists: 1. text
  html = html.replace(/^(\d+\.\s)(.*)$/gm, '<div style="margin-top: 5px;"><strong>$1</strong> $2</div>');
  // Bullet points: lines starting with - or *
  html = html.replace(/^[-*]\s(.*)$/gm, '<div style="margin-left: 20px; text-indent: -15px;">• $1</div>');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

function showTypingIndicator() {
  const container = document.getElementById('chatMessages');
  if (!container) return null;

  const typingDiv = document.createElement('div');
  const typingId = 'typing-' + Date.now();
  typingDiv.id = typingId;
  typingDiv.className = 'chat-message ai typing-indicator-message';
  typingDiv.innerHTML = `
    <div class="message-avatar"><i class="fas fa-robot"></i></div>
    <div class="message-content">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
      <p class="typing-text">Analyzing your query...</p>
    </div>
  `;
  container.appendChild(typingDiv);
  container.scrollTop = container.scrollHeight;
  return typingId;
}

function removeTypingIndicator(typingId) {
  if (!typingId) return;
  const el = document.getElementById(typingId);
  if (el) el.remove();
}

function speakText(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = currentLanguage === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('File too large (max 5MB)', 'error');
    return;
  }
  currentFile = file;
  const previewArea = document.getElementById('preview-area');
  const visualQueryArea = document.getElementById('visual-query-area');
  if (previewArea) previewArea.style.display = 'block';
  if (visualQueryArea) visualQueryArea.style.display = 'flex';

  const reader = new FileReader();
  reader.onload = (e) => {
    const imagePreview = document.getElementById('image-preview');
    if (imagePreview) imagePreview.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeSelectedFile() {
  currentFile = null;
  const fileInput = document.getElementById('fileInput');
  const previewArea = document.getElementById('preview-area');
  const visualQueryArea = document.getElementById('visual-query-area');
  if (fileInput) fileInput.value = '';
  if (previewArea) previewArea.style.display = 'none';
  if (visualQueryArea) visualQueryArea.style.display = 'none';
}

async function sendVisualQuery() {
  if (!currentFile) {
    showToast('Please select a file first', 'error');
    return;
  }
  const query = document.getElementById('visualQuery').value.trim() || 'Please analyze this file';

  showLoading();
  try {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;
      const result = await AuthHelper.sendConsultation(query, 'visual', base64);
      if (result) {
        showResponse(result);
      } else {
        showToast('Failed to process file', 'error');
      }
      hideLoading();
    };
    reader.readAsDataURL(currentFile);
  } catch (error) {
    showToast('Error processing file', 'error');
    hideLoading();
  }
}

async function loadChatHistory() {
  try {
    const history = await AuthHelper.getChatHistory();
    const container = document.getElementById('historyList');
    if (!container) return;

    if (history.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>No consultation history yet</p></div>';
      return;
    }
    container.innerHTML = history.map((item, idx) => `
      <div class="history-item" onclick="viewHistoryItem(${idx})">
        <div class="history-header"><span class="history-mode"><i class="fas fa-${item.mode === 'text' ? 'keyboard' : item.mode === 'voice' ? 'microphone' : 'camera'}"></i> ${item.mode}</span><span class="history-date">${new Date(item.timestamp).toLocaleDateString()}</span></div>
        <div class="history-query">${escapeHtml(item.query)}</div>
        <div class="history-preview">${escapeHtml(item.response.substring(0, 100))}...</div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading history:', error);
  }
}

function viewHistoryItem(index) {
  switchSection('consult');
}

async function loadLawyers() {
  try {
    const lawyers = await AuthHelper.getLawyers();
    const container = document.getElementById('lawyersGrid');
    if (!container) return;

    if (lawyers.length === 0) {
      container.innerHTML = '<p>No lawyers available at the moment.</p>';
      return;
    }
    container.innerHTML = lawyers.map(l => `
      <div class="lawyer-card">
        <div class="lawyer-header"><div class="lawyer-avatar">${l.fullName.split(' ').map(n => n[0]).join('')}</div><h3>${escapeHtml(l.fullName)}</h3><p>${escapeHtml(l.specialization?.join(', ') || 'General Practice')}</p></div>
        <div class="lawyer-body"><div class="lawyer-info-row"><i class="fas fa-briefcase"></i><span>${l.experience || 0} years experience</span></div><div class="lawyer-info-row"><i class="fas fa-map-marker-alt"></i><span>${escapeHtml(l.courtJurisdiction || 'N/A')}</span></div></div>
        <div class="lawyer-footer"><button class="btn btn-primary" onclick="openChatModal('${l._id}', '${escapeHtml(l.fullName)}')"><i class="fas fa-comments"></i> Chat</button></div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading lawyers:', error);
  }
}

async function loadAds() {
  try {
    const ads = await AuthHelper.getAds();
    if (ads.length > 0) {
      const ad = ads[Math.floor(Math.random() * ads.length)];
      const adText = document.getElementById('ad-text');
      if (adText) adText.textContent = ad.content;
    }
  } catch (error) {
    console.error('Error loading ads:', error);
  }
}

async function handlePasswordChange(e) {
  e.preventDefault();
  const newPass = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;

  if (!newPass || !confirm) {
    showToast('Please fill all fields', 'error');
    return;
  }

  if (newPass !== confirm) {
    showToast('Passwords do not match', 'error');
    return;
  }

  showLoading();
  try {
    const reqRes = await AuthHelper.apiRequest('/api/user/change-password-request', { method: 'POST' });
    if (!reqRes.ok) {
      const err = await reqRes.json();
      showToast(err.message || 'Failed to request OTP', 'error');
      return;
    }
    await reqRes.json(); // OTP sent
    hideLoading();
    openOtpModalForPasswordChange(newPass);
  } catch (error) {
    showToast('Network error', 'error');
    hideLoading();
  }
}

function openOtpModalForPasswordChange(newPassword) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'passwordOtpModal';
  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content">
      <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
      <div class="modal-header">
        <h3 data-en="Enter OTP" data-hi="OTP दर्ज करें">Enter OTP</h3>
        <p data-en="OTP sent to your email" data-hi="आपके ईमेल पर OTP भेजा गया">OTP sent to your email</p>
      </div>
      <form id="passwordOtpForm">
        <div class="form-group">
          <label for="password-otp" data-en="OTP" data-hi="OTP">OTP</label>
          <input type="text" id="password-otp" maxlength="6" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block">
          <i class="fas fa-check"></i>
          <span data-en="Verify" data-hi="सत्यापित करें">Verify</span>
        </button>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('passwordOtpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = document.getElementById('password-otp').value;
    showLoading();
    try {
      const res = await AuthHelper.apiRequest('/api/user/change-password-verify', {
        method: 'POST',
        body: JSON.stringify({ otp, newPassword })
      });
      if (res.ok) {
        showToast('Password changed');
        modal.remove();
        document.getElementById('passwordForm').reset();
      } else {
        const err = await res.json();
        showToast(err.message || 'Change failed', 'error');
      }
    } catch (error) {
      showToast('Network error', 'error');
    } finally {
      hideLoading();
    }
  });
}

async function requestDeletion() {
  if (!confirm('Are you sure you want to request account deletion?')) return;
  showLoading();
  try {
    const ok = await AuthHelper.requestAccountDeletion();
    if (ok) {
      showToast('Deletion request submitted');
      setTimeout(logout, 2000);
    } else {
      showToast('Request failed', 'error');
    }
  } catch (error) {
    showToast('Network error', 'error');
  } finally {
    hideLoading();
  }
}

async function processUpgrade(plan) {
  showLoading();
  try {
    const ok = await AuthHelper.upgradeToPremium();
    if (ok) {
      showToast('Upgraded to Premium!');
      await loadUserData();
      switchSection('consult');
    } else {
      showToast('Upgrade failed', 'error');
    }
  } catch (error) {
    showToast('Network error', 'error');
  } finally {
    hideLoading();
  }
}

async function removeAds() {
  showLoading();
  try {
    const ok = await AuthHelper.removeAds();
    if (ok) {
      showToast('Ads removed!');
      const adBanner = document.getElementById('adBanner');
      if (adBanner) adBanner.style.display = 'none';
    } else {
      showToast('Failed to remove ads', 'error');
    }
  } catch (error) {
    showToast('Network error', 'error');
  } finally {
    hideLoading();
  }
}

// Store current lawyer ID for chat
let currentLawyerId = null;

async function loadLawyers() {
  const grid = document.getElementById('lawyersGrid');
  if (!grid) return;

  try {
    const lawyers = await AuthHelper.getLawyers();
    if (!lawyers || lawyers.length === 0) {
      grid.innerHTML = '<div class="empty-state"><i class="fas fa-user-tie"></i><p>No lawyers available at the moment. Please check back later.</p></div>';
      return;
    }

    grid.innerHTML = lawyers.map(lawyer => `
      <div class="lawyer-card">
        <div class="lawyer-avatar-lg">${(lawyer.fullName || 'L').charAt(0)}</div>
        <h4 class="lawyer-name">${escapeHtml(lawyer.fullName)}</h4>
        <p class="lawyer-specialization">${escapeHtml(lawyer.specialization || 'General Practice')}</p>
        <div class="lawyer-meta">
          <span><i class="fas fa-briefcase"></i> ${lawyer.experience || 0} yrs exp</span>
          <span><i class="fas fa-star" style="color:var(--accent)"></i> ${lawyer.rating || '4.5'}</span>
        </div>
        <p class="lawyer-bio">${escapeHtml((lawyer.bio || '').substring(0, 100))}${(lawyer.bio || '').length > 100 ? '...' : ''}</p>
        <div class="lawyer-actions">
          <button class="btn btn-primary btn-sm" onclick="openChatModal('${lawyer._id}', '${escapeHtml(lawyer.fullName)}')">
            <i class="fas fa-comment-dots"></i> Message
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading lawyers:', error);
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load lawyers. Please try again.</p></div>';
  }
}

function openChatModal(lawyerId, lawyerName) {
  currentLawyerId = lawyerId;
  const nameSpan = document.getElementById('chatLawyerName');
  if (nameSpan) nameSpan.textContent = lawyerName;
  const modal = document.getElementById('lawyerChatModal');
  if (modal) modal.classList.add('active');
  // TODO: Load previous messages
}

function closeChatModal() {
  const modal = document.getElementById('lawyerChatModal');
  if (modal) modal.classList.remove('active');
}

function sendMessage() {
  const input = document.getElementById('chatInput');
  const msg = input ? input.value.trim() : '';
  if (!msg || !currentLawyerId) return;

  const chatDiv = document.getElementById('lawyerChatMessages');
  if (chatDiv) {
    chatDiv.innerHTML += `<div class="chat-message user"><div class="message-avatar"><i class="fas fa-user"></i></div><div class="message-content"><p>${escapeHtml(msg)}</p></div></div>`;
    chatDiv.scrollTop = chatDiv.scrollHeight;
  }

  if (input) input.value = '';

  if (socket) {
    const user = AuthHelper.getUser();
    socket.emit('sendMessage', { from: user.id, to: currentLawyerId, message: msg, role: 'user' });
  }
}

function addMessageToChatModal(msg) {
  const chatDiv = document.getElementById('lawyerChatMessages');
  if (!chatDiv) return;
  const senderClass = msg.sender === 'user' ? 'user' : 'lawyer';
  const avatar = msg.sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-user-tie"></i>';
  chatDiv.innerHTML += `<div class="chat-message ${senderClass}"><div class="message-avatar">${avatar}</div><div class="message-content"><p>${escapeHtml(msg.content)}</p></div></div>`;
  chatDiv.scrollTop = chatDiv.scrollHeight;
}