/* ===== APP.JS — AGOS HTML Studio (Web Mode via Node.js Server) ===== */

const API = '/api';

// ===== API CLIENT =====
const studio = {
  get: (endpoint) => fetch(API + endpoint).then(r => r.json()).catch(() => ({})),
  post: (endpoint, data) => fetch(API + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()).catch(e => ({ error: e.message })),

  saveVersion: async (data) => {
    try {
      const key = 'agos_versions_' + (data.fileName || 'untitled.html');
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      const ts = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' });
      const item = { id: 'v_' + Date.now(), timestamp: ts, path: 'local:' + Date.now() };
      list.unshift(item);
      localStorage.setItem(key, JSON.stringify(list.slice(0, 30)));
      localStorage.setItem(item.path, data.content);
      return { success: true };
    } catch (e) {
      return studio.post('/save-version', data);
    }
  },

  listVersions: async (data) => {
    try {
      const key = 'agos_versions_' + (data.fileName || 'untitled.html');
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      if (list && list.length > 0) return list;
    } catch (e) {}
    try {
      const res = await studio.post('/list-versions', data);
      return res.versions || [];
    } catch {
      return [];
    }
  },

  loadVersion: async (data) => {
    if (data.versionPath && data.versionPath.startsWith('local:')) {
      const content = localStorage.getItem(data.versionPath);
      return { content: content || '' };
    }
    return studio.post('/load-version', data);
  },

  loadFromDrive: (data) => studio.post('/load-from-drive', data),

  loadSettings: async () => {
    try {
      const s = localStorage.getItem('agos_studio_settings');
      if (s) return JSON.parse(s);
    } catch {}
    try {
      return await studio.get('/settings');
    } catch {
      return { vercel: {}, ftp: {} };
    }
  },

  saveSettings: async (data) => {
    try {
      localStorage.setItem('agos_studio_settings', JSON.stringify(data));
    } catch {}
    try {
      await studio.post('/settings', data);
    } catch {}
    return { success: true };
  },

  deployFtp: (data) => studio.post('/deploy-ftp', data),
  deployVercel: (data) => studio.post('/deploy-vercel', data)
};

// File open/save handled via <input type="file"> and download link in browser mode
let currentFilePath = null;
let currentFileName = null;
let settings = { ftp: {}, vercel: {} };
let editor;
let previewDebounce = null;

// ===== INIT =====
let deferredPrompt = null;

window.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  const installBtn = document.getElementById('btn-install-pwa');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') deferredPrompt = null;
      } else {
        alert('📌 Hướng dẫn thêm ứng dụng vào Dock / Desktop:\n\n1. Chrome/Edge: Bấm biểu tượng "Cài đặt" trên thanh địa chỉ (hoặc Menu 3 chấm -> Cài đặt ứng dụng -> Thêm vào Dock/Desktop).\n2. Safari (Mac): Chọn Tệp (File) -> Thêm vào Dock (Add to Dock).\n\nSau khi thêm, bạn có thể bấm icon trên Dock để mở app độc lập bất cứ lúc nào!');
      }
    });
  }

  initEditor();
  bindEvents();
  settings = await studio.loadSettings() || { ftp: {}, vercel: {} };
  populateFtpForm();
  populateVercelForm();
  updateVersionsList();
});

// ===== CODEMIRROR =====
function initEditor() {
  editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
    mode: 'htmlmixed',
    theme: 'dracula',
    lineNumbers: true,
    lineWrapping: false,
    autoCloseTags: true,
    matchBrackets: true,
    styleActiveLine: true,
    indentUnit: 2,
    tabSize: 2,
    extraKeys: {
      'Ctrl-S': () => saveFile(),
      'Cmd-S': () => saveFile(),
      'Ctrl-Shift-F': () => formatHTML(),
      'Cmd-Shift-F': () => formatHTML(),
    }
  });

  editor.on('change', () => {
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(updatePreview, 600);
  });

  editor.setValue(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chào mừng đến với AGOS HTML Studio</title>
  <style>
    :root {
      --primary: #3b82f6;
      --primary-dark: #1d4ed8;
      --bg: #0f172a;
      --card-bg: rgba(30, 41, 59, 0.7);
      --border: rgba(255, 255, 255, 0.1);
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      background: radial-gradient(circle at top right, #1e1b4b, #0f172a);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1.5rem;
    }
    .container {
      max-width: 800px;
      width: 100%;
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: #60a5fa;
      padding: 0.4rem 1rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    h1 {
      font-size: 2.75rem;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 1rem;
      background: linear-gradient(135deg, #ffffff, #93c5fd);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p.lead {
      font-size: 1.2rem;
      color: var(--muted);
      margin-bottom: 2.5rem;
      line-height: 1.6;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2.5rem;
      text-align: left;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      backdrop-filter: blur(8px);
      transition: transform 0.2s, border-color 0.2s;
    }
    .card:hover {
      transform: translateY(-4px);
      border-color: rgba(59, 130, 246, 0.5);
    }
    .card-icon {
      font-size: 1.75rem;
      margin-bottom: 0.75rem;
    }
    .card h3 {
      font-size: 1.1rem;
      margin-bottom: 0.5rem;
      color: #fff;
    }
    .card p {
      font-size: 0.9rem;
      color: var(--muted);
      line-height: 1.5;
    }
    .cta-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      justify-content: center;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.85rem 1.75rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 1rem;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
      box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
    }
    .btn-primary:hover {
      background: var(--primary-dark);
      box-shadow: 0 6px 20px rgba(59, 130, 246, 0.6);
    }
    footer {
      margin-top: 3rem;
      font-size: 0.85rem;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">🚀 AGOS Platform • Cloud Release</div>
    <h1>AGOS HTML Studio</h1>
    <p class="lead">Công cụ biên tập trực quan HTML, xem trước thời gian thực và xuất bản tức thì lên Vercel từ Google Drive.</p>

    <div class="grid">
      <div class="card">
        <div class="card-icon">⚡</div>
        <h3>Zero-Token Editing</h3>
        <p>Biên tập trực quan trên trình duyệt client-side, tiết kiệm 100% token AI cho các thay đổi layout & nội dung.</p>
      </div>
      <div class="card">
        <div class="card-icon">📂</div>
        <h3>Google Drive Sync</h3>
        <p>Nạp trực tiếp tệp HTML hoặc Google Docs từ link chia sẻ công khai không cần tải file về máy.</p>
      </div>
      <div class="card">
        <div class="card-icon">🌐</div>
        <h3>Instant Vercel Deploy</h3>
        <p>Xuất bản lên domain Vercel Production chuẩn toàn cầu chỉ với 1 cú click chuột.</p>
      </div>
    </div>

    <div class="cta-bar">
      <button class="btn btn-primary" onclick="alert('Hãy sửa trực tiếp mã nguồn HTML ở khung bên trái!')">Bắt đầu Chỉnh sửa ngay ✨</button>
    </div>

    <footer>Phát triển bởi AGOS Platform • Bản quyền © 2026</footer>
  </div>
</body>
</html>`);
  setTimeout(updatePreview, 200);
}

function updatePreview() {
  const content = editor.getValue();
  const frame = document.getElementById('preview-frame');
  const blob = new Blob([content], { type: 'text/html' });
  const newUrl = URL.createObjectURL(blob);
  const old = frame.src;
  frame.src = newUrl;
  if (old && old.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(old), 1000);
}

function formatHTML() {
  let html = editor.getValue();
  let indent = 0;
  const voidTags = /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)/i;
  const lines = html.split('\n');
  const formatted = [];
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { formatted.push(''); continue; }
    if (/^<\/[^>]+>/.test(trimmed)) indent = Math.max(0, indent - 1);
    formatted.push('  '.repeat(indent) + trimmed);
    if (/^<[^/!][^>]*[^/]>$/.test(trimmed) && !voidTags.test(trimmed) && !/<\//.test(trimmed)) indent++;
  }
  editor.setValue(formatted.join('\n'));
  showToast('HTML đã được format!', 'success');
}

// ===== BIND EVENTS =====
function bindEvents() {
  // Hidden file input for open
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.html,.htm,.css,.js,.txt';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    currentFileName = file.name;
    currentFilePath = null;
    const reader = new FileReader();
    reader.onload = (ev) => {
      editor.setValue(ev.target.result);
      updateFileLabel();
      updatePreview();
      updateVersionsList();
      showToast(`Đã mở: ${file.name}`, 'success');
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  document.getElementById('btn-open').addEventListener('click', () => fileInput.click());

  document.getElementById('btn-save').addEventListener('click', saveFile);
  document.getElementById('btn-snapshot').addEventListener('click', saveVersion);

  // Drive
  document.getElementById('btn-drive').addEventListener('click', () => openModal('modal-drive'));
  document.getElementById('btn-drive-load').addEventListener('click', loadFromDrive);

  // Preview controls
  document.getElementById('btn-refresh-preview').addEventListener('click', updatePreview);
  document.getElementById('btn-preview-mobile').addEventListener('click', () => {
    document.getElementById('preview-wrapper').classList.toggle('mobile');
  });
  document.getElementById('btn-preview-desktop').addEventListener('click', () => {
    document.getElementById('preview-wrapper').classList.remove('mobile');
  });

  // Format / Wrap
  document.getElementById('btn-format').addEventListener('click', formatHTML);
  document.getElementById('btn-wrap').addEventListener('click', () => {
    editor.setOption('lineWrapping', !editor.getOption('lineWrapping'));
  });

  // Deploy
  document.getElementById('btn-deploy-ftp').addEventListener('click', () => openModal('modal-ftp'));
  document.getElementById('btn-deploy-vercel').addEventListener('click', () => openModal('modal-vercel'));
  document.getElementById('btn-ftp-deploy').addEventListener('click', doFtpDeploy);
  document.getElementById('btn-vercel-deploy').addEventListener('click', doVercelDeploy);

  // Settings
  document.getElementById('btn-settings').addEventListener('click', () => openModal('modal-ftp'));

  // Versions
  document.getElementById('versions-list').addEventListener('click', (e) => {
    const item = e.target.closest('.version-item');
    if (item) showVersionsModal();
  });
}

// ===== FILE OPS =====
function saveFile() {
  const content = editor.getValue();
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFileName || 'index.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`Đã tải xuống: ${currentFileName || 'index.html'}`, 'success');
}

async function saveVersion() {
  const content = editor.getValue();
  if (!currentFileName) { currentFileName = 'untitled.html'; }
  await studio.saveVersion({ fileName: currentFileName, content });
  updateVersionsList();
  showToast('Đã lưu phiên bản!', 'success');
}

async function updateVersionsList() {
  const list = document.getElementById('versions-list');
  const versions = await studio.listVersions({ fileName: currentFileName || 'untitled.html' });
  if (!versions || !versions.length) {
    list.innerHTML = '<p class="empty-state">Chưa có phiên bản nào.</p>';
    return;
  }
  list.innerHTML = versions.slice(0, 6).map(v => `
    <div class="version-item" data-path="${v.path}">
      <span class="version-time">${v.timestamp || v.raw}</span>
    </div>
  `).join('');
}

function updateFileLabel() {
  document.getElementById('file-label').textContent = currentFileName || 'Untitled';
}

// ===== GOOGLE DRIVE =====
async function loadFromDrive() {
  const url = document.getElementById('drive-url-input').value.trim();
  if (!url) { showToast('Vui lòng nhập link Drive', 'error'); return; }
  const btn = document.getElementById('btn-drive-load');
  btn.disabled = true; btn.textContent = 'Đang tải...';
  try {
    const result = await studio.loadFromDrive({ url });
    if (result.error) throw new Error(result.error);
    if (!result.content || !result.content.includes('<')) throw new Error('File không phải HTML hoặc chưa public.');
    editor.setValue(result.content);
    currentFileName = 'from-drive.html';
    updateFileLabel();
    updatePreview();
    closeModal('modal-drive');
    showToast('Đã tải từ Google Drive!', 'success');
  } catch (e) {
    showToast('Lỗi: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Load File';
  }
}

// ===== VERSIONS MODAL =====
async function showVersionsModal() {
  const list = document.getElementById('modal-versions-list');
  const versions = await studio.listVersions({ fileName: currentFileName || 'untitled.html' });
  if (!versions || !versions.length) {
    list.innerHTML = '<p style="padding:16px;color:#5a5a8a;font-size:13px">Chưa có phiên bản nào. Nhấn "Save Version" để tạo snapshot.</p>';
  } else {
    list.innerHTML = versions.map(v => `
      <div class="modal-version-item">
        <span class="version-ts">${v.timestamp || v.raw}</span>
        <button class="btn-restore" onclick="restoreVersion('${v.path.replace(/'/g, "\\'")}')">Khôi phục</button>
      </div>
    `).join('');
  }
  openModal('modal-versions');
}

async function restoreVersion(versionPath) {
  const result = await studio.loadVersion({ versionPath });
  if (result.content) {
    editor.setValue(result.content);
    updatePreview();
    closeModal('modal-versions');
    showToast('Đã khôi phục phiên bản!', 'success');
  }
}

// ===== FTP DEPLOY =====
function populateFtpForm() {
  if (!settings.ftp) return;
  const f = settings.ftp;
  if (f.host) document.getElementById('ftp-host').value = f.host;
  if (f.port) document.getElementById('ftp-port').value = f.port;
  if (f.user) document.getElementById('ftp-user').value = f.user;
  if (f.remotePath) document.getElementById('ftp-path').value = f.remotePath;
  if (f.secure) document.getElementById('ftp-secure').checked = f.secure;
}

async function doFtpDeploy() {
  const config = {
    host: document.getElementById('ftp-host').value.trim(),
    port: document.getElementById('ftp-port').value,
    user: document.getElementById('ftp-user').value.trim(),
    password: document.getElementById('ftp-pass').value,
    remotePath: document.getElementById('ftp-path').value.trim() || '/',
    secure: document.getElementById('ftp-secure').checked,
  };
  if (!config.host || !config.user) { showToast('Vui lòng điền host và username', 'error'); return; }

  settings.ftp = { ...config, password: undefined };
  await studio.saveSettings(settings);

  const logEl = document.getElementById('ftp-log');
  logEl.innerHTML = '';
  logEl.classList.add('visible');

  const btn = document.getElementById('btn-ftp-deploy');
  btn.disabled = true; btn.textContent = 'Đang upload...';

  const result = await studio.deployFtp({
    content: editor.getValue(),
    fileName: currentFileName || 'index.html',
    config
  });

  result.logs.forEach(log => {
    const div = document.createElement('div');
    div.className = log.startsWith('✅') ? 'log-success' : log.startsWith('❌') ? 'log-error' : '';
    div.textContent = log;
    logEl.appendChild(div);
  });

  btn.disabled = false; btn.textContent = 'Deploy Now';
  if (result.success) showToast('FTP deploy thành công!', 'success');
}

// ===== VERCEL DEPLOY =====
function populateVercelForm() {
  if (!settings.vercel) return;
  if (settings.vercel.token) document.getElementById('vercel-token').value = settings.vercel.token;
  if (settings.vercel.projectName) document.getElementById('vercel-project-name').value = settings.vercel.projectName;
}

async function doVercelDeploy() {
  const token = document.getElementById('vercel-token').value.trim();
  const projectName = document.getElementById('vercel-project-name').value.trim() || currentFileName?.replace(/\.[^/.]+$/, "") || 'agos-site';
  
  const config = { token: token || undefined, projectName };
  settings.vercel = config;
  await studio.saveSettings(settings);

  const logEl = document.getElementById('vercel-log');
  logEl.innerHTML = '';
  logEl.classList.add('visible');

  const btn = document.getElementById('btn-vercel-deploy');
  btn.disabled = true; btn.textContent = 'Đang xuất bản...';

  const result = await studio.deployVercel({
    content: editor.getValue(),
    fileName: currentFileName || 'index.html',
    config
  });

  result.logs.forEach(log => {
    const div = document.createElement('div');
    div.className = log.startsWith('✅') ? 'log-success' : log.startsWith('❌') ? 'log-error' : log.startsWith('🌐') ? 'log-url' : log.startsWith('⚠️') ? 'log-error' : '';
    if (div.className === 'log-url') {
      const urlMatch = log.match(/https:\/\/[^\s]+/);
      const url = urlMatch ? urlMatch[0] : '';
      div.innerHTML = `🌐 Production URL: <a href="${url}" target="_blank" rel="noopener" style="color:var(--accent-light);text-decoration:underline;word-break:break-all;">${url}</a>`;
    } else {
      div.textContent = log;
    }
    logEl.appendChild(div);
  });

  btn.disabled = false; btn.textContent = 'Xuất Bản Ngay';
  if (result.success) showToast('Đã xuất bản Vercel thành công!', 'success');
}

// ===== MODAL HELPERS =====
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.add('hidden');
});

// ===== TOAST =====
let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.add('hidden'); }, 3000);
}
