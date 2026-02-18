// lawyer-dashboard.js – Lawyer Dashboard

if (!requireAuth('lawyer')) {
  // redirect handled in function
}

let lawyer = null;
let messages = [];
let currentClientId = null;
let socket = null;

document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  loadLawyerData();
  loadMessages();

  const token = AuthHelper.getToken();
  if (token) {
    socket = io({ auth: { token } });
    socket.on('connect', () => {
      if (lawyer) socket.emit('join', { lawyerId: lawyer._id });
    });
    socket.on('newMessage', (msg) => {
      showToast('New message from client', 'info');
      loadMessages(); // refresh
    });
  }
});

function initializeEventListeners() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchSection(item.dataset.section);
    });
  });

  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  document.getElementById('menuToggle')?.addEventListener('click', toggleSidebar);
  document.getElementById('sidebarClose')?.addEventListener('click', closeSidebar);

  document.getElementById('lawyer-profile-form')?.addEventListener('submit', handleProfileUpdate);
  document.getElementById('lawyer-password-form')?.addEventListener('submit', handlePasswordChange);
  document.getElementById('request-deletion-btn')?.addEventListener('click', requestDeletion);

  document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  document.getElementById('send-message-btn')?.addEventListener('click', sendMessage);
  document.getElementById('close-chat-modal')?.addEventListener('click', closeChatModal);

  document.getElementById('clientSearch')?.addEventListener('input', filterClients);

  // Quick actions
  document.getElementById('viewProfileBtn')?.addEventListener('click', () => switchSection('profile'));
  document.getElementById('editProfileBtn')?.addEventListener('click', () => switchSection('settings'));
  document.getElementById('viewClientsBtn')?.addEventListener('click', () => switchSection('clients'));
  document.getElementById('checkMessagesBtn')?.addEventListener('click', () => switchSection('messages'));
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('active');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('active');
}

function switchSection(section) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });
  document.querySelectorAll('.section').forEach(sec => {
    sec.classList.toggle('active', sec.id === section + '-section');
  });
  closeSidebar();
}

async function loadLawyerData() {
  showLoading();
  try {
    lawyer = await AuthHelper.getProfile();
    if (lawyer) {
      document.getElementById('lawyer-name').textContent = lawyer.fullName;
      document.getElementById('welcomeName').textContent = lawyer.fullName;
      document.getElementById('profile-name').textContent = lawyer.fullName;
      document.getElementById('profile-email').textContent = lawyer.email;
      document.getElementById('profile-phone').textContent = lawyer.phone;
      document.getElementById('profile-bar').textContent = lawyer.barCouncilNumber;
      document.getElementById('profile-aadhaar').textContent = lawyer.aadhaarNumber || 'N/A';
      document.getElementById('profile-specialization').textContent = lawyer.specialization?.join(', ') || 'N/A';
      document.getElementById('profile-experience').textContent = lawyer.experience || 'N/A';
      document.getElementById('profile-court').textContent = lawyer.courtJurisdiction || 'N/A';
      document.getElementById('profile-address').textContent = lawyer.address || 'N/A';
      document.getElementById('profile-bio').textContent = lawyer.bio || 'N/A';
      document.getElementById('profile-avatar').textContent = lawyer.fullName.charAt(0);

      document.getElementById('settings-name').value = lawyer.fullName || '';
      document.getElementById('settings-phone').value = lawyer.phone || '';
      document.getElementById('settings-specialization').value = lawyer.specialization?.join(', ') || '';
      document.getElementById('settings-address').value = lawyer.address || '';
      document.getElementById('settings-bio').value = lawyer.bio || '';
    }
  } catch (error) {
    console.error('Error loading lawyer data:', error);
  } finally {
    hideLoading();
  }
}

async function loadMessages() {
  try {
    messages = await LawyerHelper.getMessages();
    renderClientList();
    updateStats();
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}

function renderClientList() {
  const container = document.getElementById('client-list');
  const unreadCount = messages.filter(m => !m.isRead && !m.reply).length;
  document.getElementById('messageBadge').textContent = unreadCount;
  document.getElementById('notificationBadge').textContent = unreadCount;
  document.getElementById('statMessages').textContent = messages.length;
  document.getElementById('unreadMessages').textContent = unreadCount;

  // Group by user
  const clients = {};
  messages.forEach(m => {
    if (!clients[m.userId]) {
      clients[m.userId] = { userId: m.userId, userName: m.userName || `Client ${m.userId.slice(-4)}`, lastMsg: m, unread: !m.isRead && !m.reply };
    } else {
      if (new Date(m.timestamp) > new Date(clients[m.userId].lastMsg.timestamp)) {
        clients[m.userId].lastMsg = m;
      }
      if (!m.isRead && !m.reply) clients[m.userId].unread = true;
    }
  });

  const clientList = Object.values(clients).sort((a, b) => new Date(b.lastMsg.timestamp) - new Date(a.lastMsg.timestamp));

  if (clientList.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No messages yet</p></div>';
    return;
  }

  container.innerHTML = clientList.map(c => `
    <div class="client-item ${c.unread ? 'unread' : ''}" onclick="selectClient('${c.userId}', '${escapeHtml(c.userName)}')">
      <div class="client-avatar">${c.userName.charAt(0)}</div>
      <div class="client-info">
        <div class="client-name">${escapeHtml(c.userName)}</div>
        <div class="client-preview">${escapeHtml(c.lastMsg.message || c.lastMsg.reply || '')}</div>
      </div>
      <div class="client-meta">
        <span class="client-time">${new Date(c.lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        ${c.unread ? '<span class="unread-badge"></span>' : ''}
      </div>
    </div>
  `).join('');
}

function filterClients(e) {
  const term = e.target.value.toLowerCase();
  const items = document.querySelectorAll('.client-item');
  items.forEach(item => {
    const name = item.querySelector('.client-name')?.textContent.toLowerCase() || '';
    item.style.display = name.includes(term) ? '' : 'none';
  });
}

function selectClient(userId, userName) {
  currentClientId = userId;
  document.getElementById('chat-header').style.display = 'block';
  document.getElementById('chat-input-area').style.display = 'flex';
  document.getElementById('chat-client-name').textContent = userName;
  document.getElementById('chat-client-avatar').textContent = userName.charAt(0);

  const clientMsgs = messages.filter(m => m.userId === userId);
  const chatDiv = document.getElementById('chat-messages');
  chatDiv.innerHTML = '';

  if (clientMsgs.length === 0) {
    chatDiv.innerHTML = '<div class="chat-welcome"><p>Start a conversation with this client</p></div>';
  } else {
    clientMsgs.forEach(m => {
      if (m.message) {
        chatDiv.innerHTML += `<div class="chat-message user"><div class="message-avatar"><i class="fas fa-user"></i></div><div class="message-content"><p>${escapeHtml(m.message)}</p></div></div>`;
      }
      if (m.reply) {
        chatDiv.innerHTML += `<div class="chat-message lawyer"><div class="message-avatar"><i class="fas fa-user-tie"></i></div><div class="message-content"><p>${escapeHtml(m.reply)}</p></div></div>`;
      }
    });
    // Mark messages as read
    messages.filter(m => m.userId === userId && !m.isRead).forEach(m => m.isRead = true);
  }
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg || !currentClientId) return;

  showLoading();
  LawyerHelper.replyToUser(currentClientId, msg).then(ok => {
    if (ok) {
      input.value = '';
      const chatDiv = document.getElementById('chat-messages');
      chatDiv.innerHTML += `<div class="chat-message lawyer"><div class="message-avatar"><i class="fas fa-user-tie"></i></div><div class="message-content"><p>${escapeHtml(msg)}</p></div></div>`;
      chatDiv.scrollTop = chatDiv.scrollHeight;
      showToast('Reply sent');
      loadMessages(); // refresh
    } else {
      showToast('Failed to send', 'error');
    }
  }).finally(hideLoading);
}

function openChatModal(clientId, clientName) {
  selectClient(clientId, clientName);
  document.getElementById('client-chat-modal').classList.add('active');
}

function closeChatModal() {
  document.getElementById('client-chat-modal').classList.remove('active');
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  showLoading();
  const data = {
    fullName: document.getElementById('settings-name').value,
    phone: document.getElementById('settings-phone').value,
    specialization: document.getElementById('settings-specialization').value.split(',').map(s => s.trim()),
    address: document.getElementById('settings-address').value,
    bio: document.getElementById('settings-bio').value
  };
  const ok = await LawyerHelper.updateProfile(data);
  if (ok) {
    showToast('Profile updated');
    await loadLawyerData();
  } else {
    showToast('Update failed', 'error');
  }
  hideLoading();
}

async function handlePasswordChange(e) {
  e.preventDefault();
  const current = document.getElementById('lawyer-current-password').value;
  const newPass = document.getElementById('lawyer-new-password').value;
  const confirm = document.getElementById('lawyer-confirm-password').value;
  if (newPass !== confirm) {
    showToast('Passwords do not match', 'error');
    return;
  }
  // Open OTP modal
  openOtpModalForPasswordChange(current, newPass);
}

function openOtpModalForPasswordChange(currentPassword, newPassword) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'passwordOtpModal';
  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content">
      <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
      <div class="modal-header">
        <h3>Enter OTP</h3>
        <p>OTP sent to your email</p>
      </div>
      <form id="passwordOtpForm">
        <div class="form-group">
          <label for="password-otp">OTP</label>
          <input type="text" id="password-otp" maxlength="6" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block">
          <i class="fas fa-check"></i> Verify
        </button>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('passwordOtpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = document.getElementById('password-otp').value;
    showLoading();
    const ok = await AuthHelper.changePasswordWithOtp(currentPassword, newPassword, otp);
    if (ok) {
      showToast('Password changed');
      modal.remove();
      document.getElementById('lawyer-password-form').reset();
    } else {
      showToast('Change failed', 'error');
    }
    hideLoading();
  });
}

async function requestDeletion() {
  if (!confirm('Are you sure you want to request account deletion?')) return;
  showLoading();
  const ok = await AuthHelper.requestAccountDeletion();
  if (ok) {
    showToast('Deletion request submitted');
    setTimeout(logout, 2000);
  } else {
    showToast('Request failed', 'error');
  }
  hideLoading();
}

function updateStats() {
  const uniqueClients = new Set(messages.map(m => m.userId)).size;
  document.getElementById('totalClients').textContent = uniqueClients;
  document.getElementById('statClients').textContent = uniqueClients;
  document.getElementById('statMessages').textContent = messages.length;
}