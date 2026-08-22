// ============================================
// KOVA CHAT - MAIN JS
// ============================================

// State
let currentUser = null;
let currentConversationId = null;
let conversations = [];
let uploadedFiles = [];
let editingMessageId = null;
let editingConvId = null;
let isGenerating = false;
let currentAbortController = null;

// Voice state
let recognition = null;
let isRecording = false;
let isPaused = false;
let voiceTranscript = '';
let finalTranscript = '';

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  // Configure marked
  const renderer = new marked.Renderer();
  renderer.code = function (codeOrToken, language) {
    let code = '';
    let lang = '';

    if (typeof codeOrToken === 'object' && codeOrToken !== null) {
      code = codeOrToken.text || '';
      lang = codeOrToken.lang || '';
    } else {
      code = codeOrToken || '';
      lang = language || '';
    }

    return `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang">${escapeHtml(lang)}</span>
          <div style="display: flex; gap: 12px; align-items: center;">
            <button class="code-action-btn code-expand-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="7 13 12 18 17 13"></polyline>
                <polyline points="7 6 12 11 17 6"></polyline>
              </svg>
              Perluas
            </button>
            <button class="code-action-btn code-copy-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Salin
            </button>
          </div>
        </div>
        <pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>
      </div>
    `;
  };
  marked.setOptions({
    renderer: renderer,
    breaks: true,
    gfm: true
  });

  // Handle code block events
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.code-copy-btn');
    if (copyBtn) {
      const container = copyBtn.closest('.code-block-wrapper');
      if (container) {
        const codeEl = container.querySelector('code');
        if (codeEl) {
          navigator.clipboard.writeText(codeEl.innerText).then(() => {
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Tersalin`;
            setTimeout(() => {
              copyBtn.innerHTML = originalHtml;
            }, 2000);
          });
        }
      }
    }

    const expandBtn = e.target.closest('.code-expand-btn');
    if (expandBtn) {
      const container = expandBtn.closest('.code-block-wrapper');
      if (container) {
        const isExpanded = container.classList.toggle('expanded');
        if (isExpanded) {
          expandBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg> Singkat`;
        } else {
          expandBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline></svg> Perluas`;
          // Optionally scroll back to the top of the block if we are far down
          const rect = container.getBoundingClientRect();
          if (rect.top < 65) { // 65 is header height roughly
             container.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }
    }
  });

  // Init theme
  const savedTheme = localStorage.getItem('kova-theme') || 'system';
  applyTheme(savedTheme);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (localStorage.getItem('kova-theme') === 'system') {
      applyTheme('system');
    }
  });

  await initAuth();
  updateSidebarIcon();
});

// Theme functions
window.applyTheme = function (theme) {
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
};

window.setTheme = function (theme) {
  localStorage.setItem('kova-theme', theme);
  applyTheme(theme);
};

window.openThemeModal = function () {
  document.getElementById('themeModal').classList.add('open');
  const saved = localStorage.getItem('kova-theme') || 'system';
  const radio = document.querySelector(`input[name="theme"][value="${saved}"]`);
  if (radio) radio.checked = true;
  document.getElementById('userMenu').classList.remove('open');
};

window.closeThemeModal = function () {
  document.getElementById('themeModal').classList.remove('open');
};

async function initAuth(retryCount = 0) {
  const MAX_RETRIES = 20; // 20 x 3 detik = 60 detik maks

  // Tampilkan animasi loading di sidebar saat pertama kali
  const wakeTitle = document.getElementById('wakeTitle');
  const wakeBar = document.getElementById('wakeProgressBar');
  const wakeMsg = document.getElementById('wakeMessage');

  if (retryCount > 0 && wakeTitle) {
    wakeTitle.style.display = 'flex';
    const secs = retryCount * 3;
    if (wakeMsg) wakeMsg.textContent = `Menghubungkan ke server... (${secs}s)`;
    if (wakeBar) wakeBar.style.width = Math.min((secs / 60) * 100, 100) + '%';
  }

  if (retryCount >= MAX_RETRIES) {
    // Timeout - server tidak bisa dibangunkan
    if (wakeTitle) {
      if (wakeMsg) wakeMsg.textContent = 'Server tidak merespons. Coba refresh halaman.';
      if (wakeBar) wakeBar.style.background = 'var(--danger, #ef4444)';
    }
    return;
  }

  try {
    const res = await fetch(`/auth/status?t=${Date.now()}`);
    const contentType = res.headers.get('content-type') || '';

    // Render mengirim HTML ketika service sedang bangun (503/502)
    if (res.status === 503 || res.status === 502 || contentType.includes('text/html')) {
      throw new Error('Server sedang bangun');
    }

    // Error jaringan lainnya - retry
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    // Sembunyikan banner wake-up jika ada
    if (wakeTitle) wakeTitle.style.display = 'none';

    if (!data.authenticated) {
      // Belum login — redirect ke halaman login
      window.location.href = './index.html';
      return;
    }

    currentUser = data.user;
    initUser();
    await loadConversations();

  } catch (err) {
    console.warn(`[initAuth] Retry ${retryCount + 1}/${MAX_RETRIES}:`, err.message);
    setTimeout(() => initAuth(retryCount + 1), 3000);
  }
}

function initUser() {
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userEmail').textContent = currentUser.email;

  // Avatar
  if (currentUser.avatar) {
    const avatarImg = document.getElementById('userAvatarImg');
    avatarImg.src = currentUser.avatar;
    avatarImg.style.display = 'block';
    document.getElementById('userAvatarPlaceholder').style.display = 'none';
  } else {
    document.getElementById('userAvatarPlaceholder').textContent =
      currentUser.name.charAt(0).toUpperCase();
  }

  // Set saved model
  if (currentUser.selected_model) {
    const select = document.getElementById('modelSelect');
    select.value = currentUser.selected_model;
    if (!select.value) select.selectedIndex = 0;
    if (window.updateCustomModelUI) window.updateCustomModelUI();
  }
}

// ============================================
// CONVERSATIONS
// ============================================
async function loadConversations() {
  try {
    const res = await fetch('/api/conversations');
    conversations = await res.json();
    renderConversationList();
  } catch (err) {
    showToast('Gagal memuat riwayat chat', 'error');
  }
}

function renderConversationList() {
  const convList = document.getElementById('convList');

  // Clear existing
  convList.innerHTML = '';

  if (conversations.length === 0) {
    const title = document.createElement('div');
    title.className = 'sidebar-section-title';
    title.textContent = 'Riwayat';
    convList.appendChild(title);

    const empty = document.createElement('div');
    empty.style.cssText = 'padding: 20px 12px; text-align: center; color: var(--gray-400); font-size: 13px;';
    empty.textContent = 'Belum ada chat';
    convList.appendChild(empty);
    return;
  }

  const pinned = conversations.filter(c => c.is_pinned && !c.is_archived);
  const archived = conversations.filter(c => c.is_archived);
  const unpinned = conversations.filter(c => !c.is_pinned && !c.is_archived);

  if (pinned.length > 0) {
    const title = document.createElement('div');
    title.className = 'sidebar-section-title';
    title.textContent = 'Dipin';
    convList.appendChild(title);
    pinned.forEach(conv => {
      convList.appendChild(createConvItem(conv));
    });
  }

  if (unpinned.length > 0) {
    const title = document.createElement('div');
    title.className = 'sidebar-section-title';
    title.textContent = 'Riwayat';
    convList.appendChild(title);
    unpinned.forEach(conv => {
      convList.appendChild(createConvItem(conv));
    });
  }

  if (archived.length > 0) {
    const title = document.createElement('div');
    title.className = 'sidebar-section-title';
    title.textContent = 'Diarsipkan';
    convList.appendChild(title);
    archived.forEach(conv => {
      convList.appendChild(createConvItem(conv));
    });
  }
}

function createConvItem(conv) {
  const item = document.createElement('div');
  item.className = `conv-item ${conv.id === currentConversationId ? 'active' : ''}`;
  item.dataset.convId = conv.id;

  const date = new Date(conv.updated_at);
  const dateStr = formatDate(date);

  item.innerHTML = `
    <div class="conv-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </div>
    <div class="conv-info">
      <div class="conv-title">${escapeHtml(conv.title)}</div>
      <div class="conv-date">${dateStr}</div>
    </div>
    <div class="conv-actions">
      <button class="conv-action-btn pin" onclick="togglePin(event, '${conv.id}', ${conv.is_pinned})" title="${conv.is_pinned ? 'Lepas Pin' : 'Pin'}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="${conv.is_pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="17" x2="12" y2="22"></line>
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.68V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v4.68a2 2 0 0 1-1.11 1.87l-1.78.89A2 2 0 0 0 5 15.24Z"></path>
        </svg>
      </button>
      <button class="conv-action-btn archive" onclick="toggleArchive(event, '${conv.id}', ${conv.is_archived})" title="${conv.is_archived ? 'Batal Arsip' : 'Arsip'}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="${conv.is_archived ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="21 8 21 21 3 21 3 8"></polyline>
          <rect x="1" y="3" width="22" height="5"></rect>
          <line x1="10" y1="12" x2="14" y2="12"></line>
        </svg>
      </button>
      <button class="conv-action-btn delete" onclick="deleteConversation(event, '${conv.id}')" title="Hapus">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
        </svg>
      </button>
    </div>
  `;

  item.addEventListener('click', (e) => {
    if (e.target.closest('.conv-actions')) return;
    loadConversation(conv.id);
    closeMobileSidebar();
  });

  return item;
}

function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  const day = 24 * 60 * 60 * 1000;

  if (diff < day) {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } else if (diff < 7 * day) {
    return date.toLocaleDateString('id-ID', { weekday: 'short' });
  } else {
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }
}

async function startNewChat() {
  currentConversationId = null;
  editingMessageId = null;
  uploadedFiles = [];

  document.getElementById('chatTitle').textContent = 'Chat Baru';
  document.getElementById('messagesContainer').innerHTML = `
    <div class="welcome-message" id="welcomeMessage">
      <div class="welcome-logo">
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="20" fill="#38BDF8"/>
          <path d="M12 20C12 15.58 15.58 12 20 12C24.42 12 28 15.58 28 20" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="20" cy="22" r="4" fill="white"/>
        </svg>
      </div>
      <h2>Halo, ada yang bisa dibantu?</h2>
      <p>Tanya apa saja, kirim file, atau gunakan voice untuk bicara langsung ke Kova.</p>
    </div>
  `;

  resetFilePreview();
  cancelEdit();

  // Update active state in sidebar
  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));

  document.getElementById('chatTextarea').focus();
}

async function loadConversation(convId) {
  try {
    currentConversationId = convId;
    editingMessageId = null;
    cancelEdit();

    const conv = conversations.find(c => c.id === convId);
    document.getElementById('chatTitle').textContent = conv?.title || 'Chat';

    // Update active in sidebar
    document.querySelectorAll('.conv-item').forEach(el => {
      el.classList.toggle('active', el.dataset.convId === convId);
    });

    // Load messages
    const res = await fetch(`/api/conversations/${convId}/messages`);
    const messages = await res.json();

    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';

    for (const msg of messages) {
      appendMessage(msg.role, msg.content, msg.files || [], msg.id, msg.is_edited);
    }

    scrollToBottom();
  } catch (err) {
    showToast('Gagal memuat percakapan', 'error');
  }
}

async function deleteConversation(event, convId) {
  event.stopPropagation();

  try {
    await fetch(`/api/conversations/${convId}`, { method: 'DELETE' });

    if (currentConversationId === convId) {
      startNewChat();
    }

    conversations = conversations.filter(c => c.id !== convId);
    renderConversationList();
    showToast('Chat dihapus', 'success');
  } catch (err) {
    showToast('Gagal menghapus chat', 'error');
  }
}

window.togglePin = async function (event, convId, isPinned) {
  event.stopPropagation();
  try {
    const res = await fetch(`/api/conversations/${convId}/pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_pinned: !isPinned })
    });

    if (res.ok) {
      const updated = await res.json();
      const idx = conversations.findIndex(c => c.id === convId);
      if (idx !== -1) {
        conversations[idx].is_pinned = updated.is_pinned;
      }

      // Resort conversations: pinned first, then by updated_at
      conversations.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        if (a.is_archived && !b.is_archived) return 1;
        if (!a.is_archived && b.is_archived) return -1;
        return new Date(b.updated_at) - new Date(a.updated_at);
      });

      renderConversationList();
    }
  } catch (err) {
    showToast('Gagal mengubah pin', 'error');
  }
}

window.toggleArchive = async function (event, convId, isArchived) {
  event.stopPropagation();
  try {
    const res = await fetch(`/api/conversations/${convId}/archive`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: !isArchived })
    });

    if (res.ok) {
      const updated = await res.json();
      const idx = conversations.findIndex(c => c.id === convId);
      if (idx !== -1) {
        conversations[idx].is_archived = updated.is_archived;
        conversations[idx].is_pinned = updated.is_pinned; // Unpinned if archived
      }

      conversations.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        if (a.is_archived && !b.is_archived) return 1;
        if (!a.is_archived && b.is_archived) return -1;
        return new Date(b.updated_at) - new Date(a.updated_at);
      });

      renderConversationList();
    }
  } catch (err) {
    showToast('Gagal mengarsipkan chat', 'error');
  }
};

// ============================================
// MESSAGES
// ============================================
function appendMessage(role, content, files = [], msgId = null, isEdited = false) {
  const container = document.getElementById('messagesContainer');

  // Remove welcome message
  const welcome = document.getElementById('welcomeMessage');
  if (welcome) welcome.remove();

  const wrapper = document.createElement('div');
  wrapper.className = `message-group`;
  if (msgId) wrapper.dataset.msgId = msgId;

  const isUser = role === 'user';

  // Build file chips HTML
  let filesHtml = '';
  if (files && files.length > 0) {
    filesHtml = '<div class="message-files">';
    files.forEach(file => {
      const fileName = typeof file === 'string' ? file : file.original_name || file.name;
      filesHtml += `
        <div class="file-chip">
          ${getFileIcon(fileName)}
          <span class="file-chip-name">${escapeHtml(fileName)}</span>
        </div>
      `;
    });
    filesHtml += '</div>';
  }

  // Render content - markdown for AI, plain text for user
  let renderedContent = '';
  if (!isUser && content) {
    renderedContent = DOMPurify.sanitize(marked.parse(content));
  } else {
    renderedContent = `<p style="white-space:pre-wrap;">${escapeHtml(content || '')}</p>`;
  }

  const editedTag = isEdited ? '<div class="message-edited-tag">✏ diedit</div>' : '';

  const avatarHtml = isUser
    ? `<div class="message-avatar user-av">
        ${currentUser.avatar
      ? `<img src="${currentUser.avatar}" alt="${currentUser.name}">`
      : `<div class="user-avatar-placeholder" style="width:32px;height:32px;font-size:13px;">${currentUser.name.charAt(0)}</div>`
    }
       </div>`
    : `<div class="message-avatar ai">K</div>`;

  const actionsHtml = `
    <div class="message-actions">
      <button class="msg-action-btn copy-btn" onclick="copyMessage('${msgId}')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Salin
      </button>
      ${isUser && msgId ? `
      <button class="msg-action-btn edit-btn" onclick="startEditMessage('${msgId}')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        Edit
      </button>
      ` : ''}
    </div>
  `;

  wrapper.innerHTML = `
    <div class="message-wrapper ${isUser ? 'user' : 'ai'}">
      ${avatarHtml}
      <div class="message-content-wrapper">
        <div class="message-sender">${isUser ? 'Kamu' : 'Kova'}</div>
        <div class="message-bubble">
          ${filesHtml}
          <div class="message-text">${renderedContent}</div>
          ${editedTag}
        </div>
        ${actionsHtml}
      </div>
    </div>
  `;

  container.appendChild(wrapper);
  return wrapper;
}

function appendTypingIndicator() {
  const container = document.getElementById('messagesContainer');
  const wrapper = document.createElement('div');
  wrapper.className = 'message-group';
  wrapper.id = 'typingIndicator';
  wrapper.innerHTML = `
    <div class="message-wrapper ai">
      <div class="message-avatar ai">K</div>
      <div class="message-content-wrapper">
        <div class="message-sender">Kova</div>
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>
  `;
  container.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function getFileIcon(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const icons = {
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', csv: '📊',
    ppt: '📊', pptx: '📊', zip: '📦', rar: '📦', '7z': '📦',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
    mp4: '🎥', mp3: '🎵', txt: '📃', md: '📃',
    html: '🌐', css: '🎨', js: '⚡', ts: '⚡', py: '🐍',
    json: '📋', xml: '📋', yaml: '📋', yml: '📋',
  };
  const icon = icons[ext] || '📎';
  return `<span style="font-size:14px;">${icon}</span>`;
}

function scrollToBottom() {
  const container = document.getElementById('messagesContainer');
  container.scrollTop = container.scrollHeight;
}

// ============================================
// SEND MESSAGE
// ============================================
async function sendMessage() {
  const textarea = document.getElementById('chatTextarea');
  const content = textarea.value.trim();

  if (!content && uploadedFiles.length === 0) return;
  if (isGenerating) return;

  if (editingMessageId) {
    await sendEditedMessage(content);
    return;
  }

  textarea.value = '';
  autoResizeTextarea(textarea);

  const filesToSend = [...uploadedFiles];
  resetFilePreview();

  // Create conversation if needed
  if (!currentConversationId) {
    try {
      const title = content.slice(0, 60) || 'Chat Baru';
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      const conv = await res.json();
      currentConversationId = conv.id;
      conversations.unshift(conv);
      renderConversationList();
      document.getElementById('chatTitle').textContent = conv.title;

      // Update active state
      document.querySelectorAll('.conv-item').forEach(el => {
        el.classList.toggle('active', el.dataset.convId === conv.id);
      });
    } catch (err) {
      showToast('Gagal membuat percakapan baru', 'error');
      return;
    }
  }

  // Build message content with file context
  let fullContent = content;
  if (filesToSend.length > 0) {
    const fileContexts = filesToSend.map(f => {
      if (f.extractedContent && f.extractedContent !== `[File gambar: ${f.name}]`) {
        return `\n\n[Isi file "${f.name}":]:\n${f.extractedContent}`;
      }
      return '';
    }).join('');
    if (fileContexts.trim()) {
      fullContent = content + fileContexts;
    }
  }

  // Save user message to DB
  try {
    const msgRes = await fetch(`/api/conversations/${currentConversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'user',
        content: fullContent,
        files: filesToSend.map(f => ({ id: f.id, original_name: f.name, name: f.name }))
      })
    });
    const savedMsg = await msgRes.json();

    // Show user message
    appendMessage('user', content, filesToSend.map(f => ({ name: f.name })), savedMsg.id);
  } catch (err) {
    showToast('Gagal menyimpan pesan', 'error');
    return;
  }

  // Get AI response
  await getAIResponse(fullContent, currentConversationId);
}

async function getAIResponse(userMessage, conversationId) {
  setGenerating(true);

  // Get all messages for context
  let contextMessages = [];
  try {
    const res = await fetch(`/api/conversations/${conversationId}/messages`);
    const msgs = await res.json();
    contextMessages = msgs.map(m => ({ role: m.role, content: m.content }));
  } catch (e) {
    contextMessages = [{ role: 'user', content: userMessage }];
  }

  // Show typing indicator
  appendTypingIndicator();
  scrollToBottom();

  const model = document.getElementById('modelSelect').value;

  currentAbortController = new AbortController();

  let aiWrapper = null;
  let aiTextEl = null;
  let fullResponse = '';

  try {
    const response = await fetch(`/api/chat?t=${Date.now()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: contextMessages,
        model: model,
        conversationId: conversationId
      }),
      signal: currentAbortController.signal
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Error dari AI');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    removeTypingIndicator();

    // Create AI message bubble
    const aiMsgId = 'ai-' + Date.now();
    aiWrapper = appendMessage('ai', '', [], aiMsgId);
    aiTextEl = aiWrapper.querySelector('.message-text');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.content) {
              fullResponse += parsed.content;
              // Render markdown
              aiTextEl.innerHTML = DOMPurify.sanitize(marked.parse(fullResponse));
              // Removed scrollToBottom() here to prevent auto-scrolling while generating
            }
          } catch (e) {
            if (e.message !== 'Unexpected end of JSON input') {
              console.error('Parse error:', e);
            }
          }
        }
      }
    }

    // Jika AI sama sekali tidak merespons (kosong)
    if (!fullResponse.trim()) {
      aiTextEl.innerHTML = `<div style="color: var(--danger); font-style: italic; display: flex; align-items: center; gap: 8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        Model AI tidak memberikan jawaban. Server pusat mungkin sedang sibuk atau model tidak tersedia.
      </div>`;
    }

    // Update conversation list
    await loadConversations();

  } catch (err) {
    removeTypingIndicator();

    if (err.name === 'AbortError') {
      // User cancelled - show partial response if any
      if (fullResponse && aiWrapper) {
        // Already shown
      }
      showToast('Generasi dihentikan', 'info');
    } else {
      showToast('Error: ' + err.message, 'error');
      if (aiWrapper) {
        aiTextEl.innerHTML = `<p style="color: var(--danger);">Error: ${escapeHtml(err.message)}</p>`;
      } else {
        appendMessage('ai', 'Maaf, terjadi kesalahan. Silakan coba lagi.');
      }
    }
  } finally {
    setGenerating(false);
    currentAbortController = null;
    scrollToBottom();
  }
}

function setGenerating(state) {
  isGenerating = state;
  const sendBtn = document.getElementById('sendBtn');
  const stopBtn = document.getElementById('stopGenBtn');

  if (state) {
    sendBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
  } else {
    sendBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
  }
}

function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort();
  }
}

// ============================================
// EDIT MESSAGE
// ============================================
async function startEditMessage(msgId) {
  // Find message element
  const msgWrapper = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (!msgWrapper) return;

  const bubble = msgWrapper.querySelector('.message-bubble .message-text');
  const textContent = bubble?.innerText || '';

  // Find files from the message
  const fileChips = msgWrapper.querySelectorAll('.file-chip');
  const messageFiles = [];
  fileChips.forEach(chip => {
    const name = chip.querySelector('.file-chip-name')?.textContent;
    if (name) messageFiles.push({ name });
  });

  editingMessageId = msgId;

  // Set textarea
  const textarea = document.getElementById('chatTextarea');
  textarea.value = textContent;
  autoResizeTextarea(textarea);
  textarea.focus();

  // Show edit banner
  document.getElementById('editBanner').classList.add('visible');

  // Show existing files
  if (messageFiles.length > 0) {
    uploadedFiles = messageFiles.map(f => ({
      id: null,
      name: f.name,
      extractedContent: null
    }));
    renderFilePreview();
  }

  scrollToBottom();
}

async function sendEditedMessage(content) {
  if (!editingMessageId || !content.trim()) return;

  const msgId = editingMessageId;
  const convId = currentConversationId;

  cancelEdit();

  const textarea = document.getElementById('chatTextarea');
  textarea.value = '';
  autoResizeTextarea(textarea);

  const filesToSend = [...uploadedFiles];
  resetFilePreview();

  try {
    // Build full content with file context
    let fullContent = content;
    const newFiles = filesToSend.filter(f => f.id && f.extractedContent);
    if (newFiles.length > 0) {
      const fileContexts = newFiles.map(f => `\n\n[Isi file "${f.name}":]:\n${f.extractedContent}`).join('');
      fullContent = content + fileContexts;
    }

    // Delete messages after this one
    await fetch(`/api/conversations/${convId}/messages-after/${msgId}`, {
      method: 'DELETE'
    });

    // Update the message
    await fetch(`/api/messages/${msgId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: fullContent,
        files: filesToSend.map(f => ({ name: f.name }))
      })
    });

    // Reload conversation
    await loadConversation(convId);

    // Get AI response
    const res = await fetch(`/api/conversations/${convId}/messages`);
    const msgs = await res.json();
    const contextMessages = msgs.map(m => ({ role: m.role, content: m.content }));

    await getAIResponse(fullContent, convId);

  } catch (err) {
    showToast('Gagal mengedit pesan: ' + err.message, 'error');
  }
}

function cancelEdit() {
  editingMessageId = null;
  document.getElementById('editBanner').classList.remove('visible');
}

// Copy Message
window.copyMessage = function (msgId) {
  const msgWrapper = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (!msgWrapper) return;

  const bubble = msgWrapper.querySelector('.message-text');
  if (!bubble) return;

  const textToCopy = bubble.innerText;

  navigator.clipboard.writeText(textToCopy).then(() => {
    showToast('Pesan disalin!', 'success');
  }).catch(() => {
    showToast('Gagal menyalin pesan', 'error');
  });
};

// ============================================
// FILE HANDLING
// ============================================
async function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;

  showToast(`Mengupload ${files.length} file...`, 'info');

  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (!data.success) throw new Error(data.error);

    data.files.forEach(f => {
      uploadedFiles.push({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        extractedContent: f.extractedContent
      });
    });

    renderFilePreview();
    showToast(`${files.length} file berhasil diupload`, 'success');
  } catch (err) {
    showToast('Gagal upload file: ' + err.message, 'error');
  }

  // Reset input
  event.target.value = '';
}

function renderFilePreview() {
  const area = document.getElementById('filePreviewArea');
  area.innerHTML = '';

  if (uploadedFiles.length === 0) {
    area.classList.remove('has-files');
    return;
  }

  area.classList.add('has-files');

  uploadedFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'file-preview-item';
    item.innerHTML = `
      <span style="font-size:14px;">${getFileIcon(file.name)}</span>
      <span class="file-preview-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
      <button class="file-preview-remove" onclick="removeFile(${index})" title="Hapus file">×</button>
    `;
    area.appendChild(item);
  });
}

function removeFile(index) {
  uploadedFiles.splice(index, 1);
  renderFilePreview();
}

function resetFilePreview() {
  uploadedFiles = [];
  document.getElementById('filePreviewArea').innerHTML = '';
  document.getElementById('filePreviewArea').classList.remove('has-files');
}

// ============================================
// VOICE INPUT
// ============================================
function toggleVoice() {
  if (isRecording || isPaused) {
    cancelVoice();
  } else {
    startVoice();
  }
}

function startVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Browser tidak mendukung voice input', 'error');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'id-ID';
  recognition.continuous = true;
  recognition.interimResults = true;

  voiceTranscript = '';
  finalTranscript = '';

  recognition.onstart = () => {
    isRecording = true;
    isPaused = false;
    updateVoiceUI(true);
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }
    }
    voiceTranscript = finalTranscript + interimTranscript;
    document.getElementById('voiceTranscript').textContent = voiceTranscript || 'Mulai berbicara...';
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    if (event.error !== 'aborted') {
      showToast('Error voice: ' + event.error, 'error');
    }
    cancelVoice();
  };

  recognition.onend = () => {
    if (isRecording && !isPaused) {
      // Auto restart if still recording
      try {
        recognition.start();
      } catch (e) { }
    }
  };

  recognition.start();

  // Show voice controls
  document.getElementById('voiceControls').classList.add('visible');
  document.getElementById('voiceBtn').classList.add('recording');
}

function stopVoice() {
  // Stop recording but keep the transcript
  if (recognition) {
    recognition.stop();
    isRecording = false;
    isPaused = true;
  }

  // Update UI
  const dot = document.getElementById('voiceDot');
  dot.classList.add('paused');
  document.getElementById('voiceStatus').textContent = 'Dihentikan';
  document.getElementById('voiceStopBtn').style.display = 'none';
  document.getElementById('voiceResumeBtn').style.display = 'inline-flex';
  document.getElementById('voiceBtn').classList.remove('recording');

  // Set transcript to textarea
  if (voiceTranscript) {
    const textarea = document.getElementById('chatTextarea');
    textarea.value = voiceTranscript.trim();
    autoResizeTextarea(textarea);
  }
}

function resumeVoice() {
  if (!isPaused) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'id-ID';
  recognition.continuous = true;
  recognition.interimResults = true;

  const existingTranscript = finalTranscript;

  recognition.onstart = () => {
    isRecording = true;
    isPaused = false;
    document.getElementById('voiceDot').classList.remove('paused');
    document.getElementById('voiceStatus').textContent = 'Merekam...';
    document.getElementById('voiceStopBtn').style.display = 'inline-flex';
    document.getElementById('voiceResumeBtn').style.display = 'none';
    document.getElementById('voiceBtn').classList.add('recording');
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let newFinal = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        newFinal += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }
    }
    finalTranscript = existingTranscript + newFinal;
    voiceTranscript = finalTranscript + interimTranscript;
    document.getElementById('voiceTranscript').textContent = voiceTranscript || 'Mulai berbicara...';
  };

  recognition.onerror = (event) => {
    if (event.error !== 'aborted') {
      showToast('Error voice: ' + event.error, 'error');
    }
    cancelVoice();
  };

  recognition.onend = () => {
    if (isRecording && !isPaused) {
      try { recognition.start(); } catch (e) { }
    }
  };

  recognition.start();
}

function cancelVoice() {
  if (recognition) {
    isRecording = false;
    isPaused = false;
    recognition.stop();
    recognition = null;
  }

  voiceTranscript = '';
  finalTranscript = '';

  document.getElementById('voiceControls').classList.remove('visible');
  document.getElementById('voiceBtn').classList.remove('recording', 'active');
  document.getElementById('voiceTranscript').textContent = 'Mulai berbicara...';
  document.getElementById('voiceDot').classList.remove('paused');
  document.getElementById('voiceStatus').textContent = 'Merekam...';
  document.getElementById('voiceStopBtn').style.display = 'inline-flex';
  document.getElementById('voiceResumeBtn').style.display = 'none';
}

function sendVoice() {
  // Get the transcript
  const transcript = voiceTranscript.trim();

  if (!transcript) {
    showToast('Tidak ada teks yang direkam', 'error');
    return;
  }

  // Stop recording
  if (recognition) {
    isRecording = false;
    isPaused = false;
    recognition.stop();
    recognition = null;
  }

  // Put transcript in textarea
  const textarea = document.getElementById('chatTextarea');
  textarea.value = transcript;
  autoResizeTextarea(textarea);

  // Hide voice controls
  document.getElementById('voiceControls').classList.remove('visible');
  document.getElementById('voiceBtn').classList.remove('recording', 'active');
  document.getElementById('voiceStatus').textContent = 'Merekam...';
  document.getElementById('voiceDot').classList.remove('paused');
  document.getElementById('voiceStopBtn').style.display = 'inline-flex';
  document.getElementById('voiceResumeBtn').style.display = 'none';

  voiceTranscript = '';
  finalTranscript = '';

  // Send immediately
  sendMessage();
}

function updateVoiceUI(isActive) {
  const voiceBtn = document.getElementById('voiceBtn');
  if (isActive) {
    voiceBtn.classList.add('recording');
  } else {
    voiceBtn.classList.remove('recording');
  }
}

// ============================================
// TEXTAREA
// ============================================
function handleTextareaKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

// ============================================
// USER MENU
// ============================================
function toggleUserMenu() {
  const menu = document.getElementById('userMenu');
  menu.classList.toggle('open');
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  const profile = document.getElementById('userProfile');
  const menu = document.getElementById('userMenu');
  if (!profile.contains(e.target)) {
    menu.classList.remove('open');
  }
});

function handleLogout() {
  window.location.href = API_BASE_URL + '/auth/logout';
}

function showDeleteAccountModal() {
  document.getElementById('userMenu').classList.remove('open');
  document.getElementById('deleteAccountModal').classList.add('open');
}

function closeDeleteAccountModal() {
  document.getElementById('deleteAccountModal').classList.remove('open');
}

async function deleteAccount() {
  try {
    const res = await fetch('/api/user/account', { method: 'DELETE' });
    const data = await res.json();

    if (data.success) {
      window.location.href = './index.html';
    } else {
      showToast('Gagal menghapus akun', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ============================================
// MODEL
// ============================================
async function handleModelChange() {
  const model = document.getElementById('modelSelect').value;
  try {
    await fetch('/api/user/model', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
  } catch (err) {
    console.error('Failed to save model preference:', err);
  }
}

// ============================================
// ============================================
// SIDEBAR TOGGLE (DESKTOP & MOBILE)
// ============================================
const ICON_MENU = `<line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line>`;
const ICON_CLOSE = `<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>`;

function updateSidebarIcon() {
  const icon = document.getElementById('sidebarToggleIcon');
  if (!icon) return;
  const sidebar = document.getElementById('sidebar');
  const isHidden = sidebar.classList.contains('collapsed-desktop') || 
                   (window.innerWidth <= 768 && !sidebar.classList.contains('mobile-open'));
  icon.innerHTML = isHidden ? ICON_MENU : ICON_CLOSE;
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('visible');
  } else {
    sidebar.classList.toggle('collapsed-desktop');
  }
  updateSidebarIcon();
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (window.innerWidth <= 768) {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('visible');
  }
  updateSidebarIcon();
}

// ============================================
// TOAST
// ============================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// UTILS
// ============================================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}