// admin-dashboard.js – Admin Dashboard

if (!requireAuth('admin')) {
  // redirect handled in function
}

let users = [];
let lawyers = [];
let pendingLawyers = [];

document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  loadAllData();
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

  document.getElementById('userSearch')?.addEventListener('input', filterUsers);
  document.getElementById('lawyerSearch')?.addEventListener('input', filterLawyers);

  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      filterLawyers(tab.dataset.filter);
    });
  });

  document.getElementById('exportUsersBtn')?.addEventListener('click', exportUsers);

  // View All links
  document.querySelectorAll('.view-all').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('href').substring(1); // remove #
      switchSection(target);
    });
  });
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

async function loadAllData() {
  showLoading();
  await Promise.all([
    loadStats(),
    loadUsers(),
    loadLawyers(),
    loadPendingLawyers()
  ]);
  hideLoading();
}

async function loadStats() {
  try {
    const usersList = await AdminHelper.getAllUsers();
    const lawyersList = await AdminHelper.getAllLawyers();
    const pending = await AdminHelper.getPendingLawyers();

    document.getElementById('total-users').textContent = usersList.length;
    document.getElementById('total-lawyers').textContent = lawyersList.filter(l => l.isApproved).length;
    document.getElementById('pending-lawyers').textContent = pending.length;
    document.getElementById('premium-users').textContent = usersList.filter(u => u.isPremium).length;
    document.getElementById('deletion-requests').textContent = usersList.filter(u => u.deletionRequested).length + lawyersList.filter(l => l.deletionRequested).length;
    document.getElementById('total-queries').textContent = usersList.reduce((acc, u) => acc + (u.chatHistory?.length || 0), 0);

    renderRecentUsers(usersList.slice(0, 5));
    renderPendingLawyersList(pending);
    renderDeletionRequests([...usersList.filter(u => u.deletionRequested), ...lawyersList.filter(l => l.deletionRequested)]);
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

function renderRecentUsers(users) {
  const list = document.getElementById('recentUsersList');
  if (users.length === 0) {
    list.innerHTML = '<div class="empty-state">No users</div>';
    return;
  }
  list.innerHTML = users.map(u => `
    <div class="recent-item" onclick="viewUserDetails('${u._id}')">
      <div class="recent-avatar">${u.fullName.charAt(0)}</div>
      <div class="recent-info">
        <div class="recent-name">${escapeHtml(u.fullName)}</div>
        <div class="recent-meta">${escapeHtml(u.email)}</div>
      </div>
      <span class="recent-status ${u.isPremium ? 'premium' : 'free'}">${u.isPremium ? 'Premium' : 'Free'}</span>
    </div>
  `).join('');
}

function renderPendingLawyersList(lawyers) {
  const list = document.getElementById('pendingLawyersList');
  if (lawyers.length === 0) {
    list.innerHTML = '<div class="empty-state">No pending approvals</div>';
    return;
  }
  list.innerHTML = lawyers.map(l => `
    <div class="recent-item" onclick="openLawyerApprovalModal('${l._id}')">
      <div class="recent-avatar">${l.fullName.charAt(0)}</div>
      <div class="recent-info">
        <div class="recent-name">${escapeHtml(l.fullName)}</div>
        <div class="recent-meta">${escapeHtml(l.email)}</div>
      </div>
      <span class="recent-status pending">Pending</span>
    </div>
  `).join('');
}

function renderDeletionRequests(requests) {
  const container = document.getElementById('deletionList');
  if (requests.length === 0) {
    container.innerHTML = '<div class="empty-state">No deletion requests</div>';
    return;
  }
  container.innerHTML = requests.map(r => `
    <div class="deletion-item">
      <div class="deletion-avatar">${r.fullName.charAt(0)}</div>
      <div class="deletion-info">
        <div class="deletion-name">${escapeHtml(r.fullName)}</div>
        <div class="deletion-meta">${escapeHtml(r.email)} - ${r.constructor.modelName}</div>
      </div>
      <div class="deletion-actions">
        <button class="btn btn-danger btn-sm" onclick="approveDeletion('${r._id}', '${r.constructor.modelName.toLowerCase()}')">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    </div>
  `).join('');
}

async function loadUsers() {
  try {
    users = await AdminHelper.getAllUsers();
    renderUsersTable();
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

function renderUsersTable(filter = '') {
  const tbody = document.querySelector('#usersTable tbody');
  const filtered = users.filter(u =>
    u.fullName?.toLowerCase().includes(filter.toLowerCase()) ||
    u.email?.toLowerCase().includes(filter.toLowerCase()) ||
    u.phone?.includes(filter)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No users found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(u => `
    <tr>
      <td>${escapeHtml(u.fullName)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.phone)}</td>
      <td>${u.isPremium ? '<span class="status-badge premium">Premium</span>' : '<span class="status-badge free">Free</span>'}</td>
      <td>${new Date(u.createdAt).toLocaleDateString()}</td>
      <td>${u.deletionRequested ? '<span class="status-badge deletion">Deletion Requested</span>' : '<span class="status-badge active">Active</span>'}</td>
      <td>
        <div class="table-actions">
          ${u.deletionRequested
      ? `<button class="table-btn danger" onclick="approveDeletion('${u._id}', 'user')" title="Approve Deletion"><i class="fas fa-trash"></i></button>`
      : `<button class="table-btn" onclick="viewUserDetails('${u._id}')" title="View"><i class="fas fa-eye"></i></button>`}
        </div>
      </td>
    </tr>
  `).join('');
}

function filterUsers(e) {
  renderUsersTable(e.target.value);
}

async function loadLawyers() {
  try {
    lawyers = await AdminHelper.getAllLawyers();
    renderLawyersTable();
  } catch (error) {
    console.error('Error loading lawyers:', error);
  }
}

function renderLawyersTable(filter = '', status = 'all') {
  const tbody = document.querySelector('#lawyersTable tbody');
  let filtered = lawyers.filter(l =>
    (l.fullName?.toLowerCase().includes(filter.toLowerCase()) ||
      l.email?.toLowerCase().includes(filter.toLowerCase()) ||
      l.phone?.includes(filter)) &&
    (status === 'all' || (status === 'pending' ? !l.isApproved : l.isApproved))
  );

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No lawyers found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(l => `
    <tr>
      <td>${escapeHtml(l.fullName)}</td>
      <td>${escapeHtml(l.email)}</td>
      <td>${escapeHtml(l.barCouncilNumber)}</td>
      <td>${l.isApproved ? '<span class="status-badge approved">Approved</span>' : '<span class="status-badge pending">Pending</span>'}</td>
      <td>${new Date(l.createdAt).toLocaleDateString()}</td>
      <td>${l.deletionRequested ? '<span class="status-badge deletion">Deletion Requested</span>' : '<span class="status-badge active">Active</span>'}</td>
      <td>
        <div class="table-actions">
          ${!l.isApproved
      ? `<button class="table-btn success" onclick="approveLawyer('${l._id}')" title="Approve"><i class="fas fa-check"></i></button>`
      : ''}
          ${l.deletionRequested
      ? `<button class="table-btn danger" onclick="approveDeletion('${l._id}', 'lawyer')" title="Approve Deletion"><i class="fas fa-trash"></i></button>`
      : ''}
          <button class="table-btn" onclick="viewLawyerDetails('${l._id}')" title="View"><i class="fas fa-eye"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterLawyers(status = 'all') {
  const search = document.getElementById('lawyerSearch')?.value || '';
  renderLawyersTable(search, status);
}

async function loadPendingLawyers() {
  try {
    pendingLawyers = await AdminHelper.getPendingLawyers();
    renderPendingLawyers();
  } catch (error) {
    console.error('Error loading pending lawyers:', error);
  }
}

function renderPendingLawyers() {
  const container = document.getElementById('pending-list');
  if (pendingLawyers.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>No pending approvals</p></div>';
    return;
  }
  container.innerHTML = pendingLawyers.map(l => `
    <div class="pending-card">
      <div class="pending-header">
        <div class="pending-info"><h4>${escapeHtml(l.fullName)}</h4><p>${escapeHtml(l.email)}</p></div>
        <span class="status-badge pending">Pending Approval</span>
      </div>
      <div class="pending-details">
        <div class="detail-item"><span class="detail-label">Phone</span><span class="detail-value">${escapeHtml(l.phone)}</span></div>
        <div class="detail-item"><span class="detail-label">Bar Council</span><span class="detail-value">${escapeHtml(l.barCouncilNumber)}</span></div>
        <div class="detail-item"><span class="detail-label">Experience</span><span class="detail-value">${l.experience || 0} years</span></div>
        <div class="detail-item"><span class="detail-label">Specialization</span><span class="detail-value">${escapeHtml(l.specialization?.join(', ') || 'N/A')}</span></div>
        <div class="detail-item"><span class="detail-label">Jurisdiction</span><span class="detail-value">${escapeHtml(l.courtJurisdiction || 'N/A')}</span></div>
      </div>
      <div class="pending-actions">
        <button class="btn btn-outline" onclick="rejectLawyer('${l._id}')"><i class="fas fa-times"></i> Reject</button>
        <button class="btn btn-success" onclick="approveLawyer('${l._id}')"><i class="fas fa-check"></i> Approve</button>
      </div>
    </div>
  `).join('');
}

async function approveLawyer(lawyerId) {
  showLoading();
  const ok = await AdminHelper.approveLawyer(lawyerId);
  if (ok) {
    showToast('Lawyer approved');
    await loadAllData();
  } else {
    showToast('Approval failed', 'error');
  }
  hideLoading();
}

function rejectLawyer(lawyerId) {
  if (!confirm('Reject this lawyer application?')) return;
  // TODO: implement reject API
  showToast('Lawyer rejected');
}

async function approveDeletion(userId, type) {
  if (!confirm(`Delete this ${type} account?`)) return;
  showLoading();
  const ok = await AdminHelper.approveDeletion(userId, type);
  if (ok) {
    showToast(`${type} deleted`);
    await loadAllData();
  } else {
    showToast('Deletion failed', 'error');
  }
  hideLoading();
}

function viewUserDetails(userId) {
  const user = users.find(u => u._id === userId);
  if (!user) return;
  alert(`User Details:\nName: ${user.fullName}\nEmail: ${user.email}\nPhone: ${user.phone}\nPremium: ${user.isPremium ? 'Yes' : 'No'}\nJoined: ${new Date(user.createdAt).toLocaleDateString()}`);
}

function viewLawyerDetails(lawyerId) {
  const lawyer = lawyers.find(l => l._id === lawyerId);
  if (!lawyer) return;
  alert(`Lawyer Details:\nName: ${lawyer.fullName}\nEmail: ${lawyer.email}\nPhone: ${lawyer.phone}\nBar Council: ${lawyer.barCouncilNumber}\nAadhaar: ${lawyer.aadhaarNumber}\nSpecialization: ${lawyer.specialization?.join(', ') || 'N/A'}\nExperience: ${lawyer.experience || 0} years`);
}

function exportUsers() {
  const csv = users.map(u => `${u.fullName},${u.email},${u.phone},${u.isPremium ? 'Premium' : 'Free'},${new Date(u.createdAt).toLocaleDateString()}`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'users.csv';
  a.click();
  URL.revokeObjectURL(url);
}