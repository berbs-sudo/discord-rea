// ============================================================================
// Discord REA Client (app.js)
// Recriação completa do Discord com Voz, Vídeo, Compartilhamento de Tela (Go Live),
// Servidores, Canais, DMs, Amigos, Markdown, Reações, Anexos e Multi-Rede
// ============================================================================

(function () {
  const urlParams = new URLSearchParams(window.location.search);
  const forceNewSession = urlParams.get('newSession') === '1';

  const storageKey = 'discord_rea_token';
  function getSavedToken() {
    if (forceNewSession) return sessionStorage.getItem(storageKey);
    return sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey);
  }
  function saveToken(token) {
    sessionStorage.setItem(storageKey, token);
    if (!forceNewSession) localStorage.setItem(storageKey, token);
  }
  function clearToken() {
    sessionStorage.removeItem(storageKey);
    if (!forceNewSession) localStorage.removeItem(storageKey);
  }

  // Application State
  const state = {
    token: getSavedToken(),
    me: null,
    users: new Map(),
    servers: [],
    allPublicServers: [],
    dms: [],
    friendships: [],
    voiceStates: [],
    network: null,
    customIceServers: [],

    // Navigation
    mode: 'server', // 'server' | 'home'
    activeServerId: 'srv_default_rea',
    activeChannelId: 'chan_boas_vindas',
    friendsTab: 'online', // 'online' | 'all' | 'pending' | 'add'
    collapsedCategories: new Set(),
    showMembersSidebar: true,
    searchQuery: '',

    // Chat state
    messagesByChannel: new Map(),
    replyingTo: null,
    editingMessageId: null,
    stagedAttachments: [],
    typingUsersByChannel: new Map(),

    // Voice & Stage UI state
    stageLayout: 'spotlight', // 'grid' | 'spotlight'
    focusedTileKey: null,
    stageCollapsedInText: false,
    coverFitTiles: new Set(),
    relayFramesByUser: new Map(), // userId -> { dataUrl, ts }

    // Preferences
    theme: localStorage.getItem('discord_rea_theme') || 'dark',
    compactMode: localStorage.getItem('discord_rea_compact') === '1'
  };

  let socket = null;
  let voiceEngine = null;
  const audioFX = new window.DiscordAudioFX();

  // Apply saved theme
  function applyAppearance() {
    document.body.classList.remove('theme-midnight', 'theme-light', 'compact-mode');
    if (state.theme === 'midnight') document.body.classList.add('theme-midnight');
    if (state.theme === 'light') document.body.classList.add('theme-light');
    if (state.compactMode) document.body.classList.add('compact-mode');
  }
  applyAppearance();

  // Helper: Toast Notification
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    if (type === 'success') el.style.borderLeftColor = '#23a55a';
    if (type === 'error') el.style.borderLeftColor = '#f23f43';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s';
      setTimeout(() => el.remove(), 260);
    }, 3800);
  }

  // Helper: API Request
  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }
    const res = await fetch(path, {
      ...options,
      headers,
      body:
        options.body && !(options.body instanceof FormData) && typeof options.body !== 'string'
          ? JSON.stringify(options.body)
          : options.body
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Erro HTTP ${res.status}`);
    }
    return data;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getUser(userId) {
    return (
      state.users.get(userId) || {
        id: userId,
        username: 'usuario',
        displayName: 'Usuário',
        discriminator: '0000',
        avatarColor: '#5865F2',
        status: 'offline'
      }
    );
  }

  function getInitials(name) {
    const parts = String(name || 'U').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name || 'U').slice(0, 2).toUpperCase();
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return isToday ? `Hoje às ${timeStr}` : `${d.toLocaleDateString('pt-BR')} ${timeStr}`;
  }

  function getActiveServer() {
    return state.servers.find(s => s.id === state.activeServerId) || state.servers[0] || null;
  }

  function getActiveChannel() {
    if (state.mode === 'home') {
      if (state.activeChannelId && state.activeChannelId.startsWith('dm_')) {
        return state.dms.find(d => d.id === state.activeChannelId) || null;
      }
      return null;
    }
    const srv = getActiveServer();
    if (!srv) return null;
    return srv.channels.find(c => c.id === state.activeChannelId) || srv.channels[0] || null;
  }

  function getDmTitle(dm) {
    if (!dm) return 'Mensagem Direta';
    if (dm.name) return dm.name;
    const others = (dm.participantIds || [])
      .filter(id => id !== state.me?.id)
      .map(id => getUser(id).displayName);
    return others.join(', ') || 'Mensagem Direta';
  }

  function getDmPeer(dm) {
    if (!dm) return null;
    const otherId = (dm.participantIds || []).find(id => id !== state.me?.id) || dm.participantIds?.[0];
    return otherId ? getUser(otherId) : null;
  }

  // ==================== AUTH SCREEN HANDLERS ====================
  let isRegisterMode = false;
  const authOverlay = document.getElementById('auth-overlay');
  const appShell = document.getElementById('app-shell');
  const authForm = document.getElementById('auth-form');
  const authError = document.getElementById('auth-error');
  const authToggleMode = document.getElementById('auth-toggle-mode');

  function updateAuthModeUI() {
    document.getElementById('auth-title').textContent = isRegisterMode
      ? 'Criar uma conta'
      : 'Boas-vindas de volta!';
    document.getElementById('auth-subtitle').textContent = isRegisterMode
      ? 'Crie seu perfil para conversar e compartilhar tela com seus amigos.'
      : 'Estamos muito animados em te ver novamente!';
    document.getElementById('auth-displayname-group').classList.toggle('hidden', !isRegisterMode);
    document.getElementById('auth-submit-btn').textContent = isRegisterMode ? 'Continuar' : 'Entrar';
    document.getElementById('auth-switch-box').innerHTML = isRegisterMode
      ? 'Já tem uma conta? <a id="auth-toggle-mode">Entrar</a>'
      : 'Precisando de uma conta? <a id="auth-toggle-mode">Registre-se</a>';
    document.getElementById('auth-toggle-mode').onclick = () => {
      isRegisterMode = !isRegisterMode;
      authError.classList.add('hidden');
      updateAuthModeUI();
    };
  }
  if (authToggleMode) {
    authToggleMode.onclick = () => {
      isRegisterMode = !isRegisterMode;
      authError.classList.add('hidden');
      updateAuthModeUI();
    };
  }

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');
    const username = document.getElementById('auth-username').value.trim();
    const displayName = document.getElementById('auth-displayname').value.trim();
    const password = document.getElementById('auth-password').value;

    try {
      const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
      const res = await api(endpoint, {
        method: 'POST',
        body: { username, displayName, password }
      });
      state.token = res.token;
      saveToken(res.token);
      await bootstrapApp();
    } catch (err) {
      authError.textContent = err.message;
      authError.classList.remove('hidden');
    }
  });

  document.getElementById('guest-login-btn').addEventListener('click', async () => {
    const nameInput = document.getElementById('guest-name-input').value.trim();
    try {
      const res = await api('/api/auth/guest', {
        method: 'POST',
        body: { displayName: nameInput || 'Convidado' }
      });
      state.token = res.token;
      saveToken(res.token);
      await bootstrapApp();
    } catch (err) {
      authError.textContent = err.message;
      authError.classList.remove('hidden');
    }
  });

  // ==================== BOOTSTRAP & SOCKET INITIALIZATION ====================
  async function bootstrapApp() {
    if (!state.token) {
      authOverlay.classList.remove('hidden');
      appShell.classList.add('hidden');
      return;
    }

    try {
      const data = await api('/api/bootstrap');
      state.me = data.me;
      state.users.clear();
      for (const u of data.users || []) state.users.set(u.id, u);
      state.servers = data.servers || [];
      state.allPublicServers = data.allPublicServers || [];
      state.dms = data.dms || [];
      state.friendships = data.friendships || [];
      state.voiceStates = data.voiceStates || [];
      state.network = data.network || null;

      if (state.servers.length > 0 && !state.servers.some(s => s.id === state.activeServerId)) {
        state.activeServerId = state.servers[0].id;
      }
      const srv = getActiveServer();
      if (srv && !srv.channels.some(c => c.id === state.activeChannelId)) {
        const firstText = srv.channels.find(c => c.type !== 'voice') || srv.channels[0];
        state.activeChannelId = firstText?.id || null;
      }

      authOverlay.classList.add('hidden');
      appShell.classList.remove('hidden');

      initSocketAndVoice();
      renderAll();

      if (state.activeChannelId) {
        await loadChannelMessages(state.activeChannelId);
      }

      // Check if URL has an ?invite=CODE parameter
      const invCode = urlParams.get('invite');
      if (invCode) {
        try {
          const joined = await api('/api/invites/join', {
            method: 'POST',
            body: { inviteCode: invCode }
          });
          if (joined.server) {
            state.mode = 'server';
            state.activeServerId = joined.server.id;
            state.activeChannelId = joined.server.channels[0]?.id;
            showToast(`Você entrou no servidor ${joined.server.name}!`, 'success');
            renderAll();
          }
        } catch (_e) {}
      }
    } catch (err) {
      console.warn('Sessão expirada ou inválida:', err.message);
      clearToken();
      state.token = null;
      authOverlay.classList.remove('hidden');
      appShell.classList.add('hidden');
    }
  }

  function initSocketAndVoice() {
    if (socket) {
      socket.disconnect();
    }

    socket = window.io({
      auth: { token: state.token }
    });

    voiceEngine = new window.DiscordVoiceEngine({
      socket,
      audioFX,
      getIceServers: () => [
        ...(state.network?.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }]),
        ...state.customIceServers
      ],
      onStreamsChanged: () => {
        renderSidebar();
        renderVoiceConnectedBar();
        renderUserPanel();
        renderStage();
      },
      onSpeakingChanged: (speaking) => {
        const myV = state.voiceStates.find(v => v.userId === state.me?.id);
        if (myV) myV.speaking = speaking;
        renderSidebar();
        renderStage();
      },
      onRelayFrame: ({ fromUserId, dataUrl, ts }) => {
        state.relayFramesByUser.set(fromUserId, { dataUrl, ts });
        const imgEl = document.getElementById(`relay-img-${fromUserId}`);
        if (imgEl) {
          imgEl.src = dataUrl;
          imgEl.classList.remove('hidden');
        } else {
          renderStage();
        }
      },
      onStatsUpdated: ({ rtt }) => {
        const rttEl = document.getElementById('voice-rtt-badge');
        if (rttEl) rttEl.textContent = `${rtt} ms`;
      },
      onToast: (msg) => showToast(msg, 'info')
    });

    // Socket Real-Time Listeners
    socket.on('user:updated', (u) => {
      state.users.set(u.id, u);
      if (state.me && u.id === state.me.id) state.me = u;
      renderSidebar();
      renderUserPanel();
      renderMembersSidebar();
      if (state.mode === 'home') renderFriendsView();
    });

    socket.on('server:created', (srv) => {
      if (srv.members.some(m => m.userId === state.me?.id)) {
        const idx = state.servers.findIndex(s => s.id === srv.id);
        if (idx >= 0) state.servers[idx] = srv;
        else state.servers.push(srv);
      }
      renderAll();
    });

    socket.on('server:updated', (srv) => {
      const idx = state.servers.findIndex(s => s.id === srv.id);
      if (srv.members.some(m => m.userId === state.me?.id)) {
        if (idx >= 0) state.servers[idx] = srv;
        else state.servers.push(srv);
      }
      renderAll();
    });

    socket.on('dm:created', (dm) => {
      if (dm.participantIds.includes(state.me?.id)) {
        if (!state.dms.some(d => d.id === dm.id)) {
          state.dms.unshift(dm);
        }
        renderSidebar();
      }
    });

    socket.on('friendship:updated', (frd) => {
      if (frd.fromUserId !== state.me?.id && frd.toUserId !== state.me?.id) return;
      const idx = state.friendships.findIndex(f => f.id === frd.id);
      if (idx >= 0) state.friendships[idx] = frd;
      else state.friendships.push(frd);
      if (state.mode === 'home') renderFriendsView();
      renderSidebar();
    });

    socket.on('friendship:removed', ({ id }) => {
      state.friendships = state.friendships.filter(f => f.id !== id);
      if (state.mode === 'home') renderFriendsView();
      renderSidebar();
    });

    socket.on('message:new', (msg) => {
      const list = state.messagesByChannel.get(msg.channelId) || [];
      if (!list.some(m => m.id === msg.id)) {
        list.push(msg);
        state.messagesByChannel.set(msg.channelId, list);
      }
      if (msg.authorId !== state.me?.id) {
        audioFX.messagePing();
      }
      if (msg.channelId === state.activeChannelId) {
        renderMessages(true);
      }
    });

    socket.on('message:update', (msg) => {
      const list = state.messagesByChannel.get(msg.channelId) || [];
      const idx = list.findIndex(m => m.id === msg.id);
      if (idx >= 0) {
        list[idx] = msg;
        state.messagesByChannel.set(msg.channelId, list);
        if (msg.channelId === state.activeChannelId) renderMessages(false);
      }
    });

    socket.on('message:delete', ({ id, channelId }) => {
      const list = state.messagesByChannel.get(channelId) || [];
      state.messagesByChannel.set(
        channelId,
        list.filter(m => m.id !== id)
      );
      if (channelId === state.activeChannelId) renderMessages(false);
    });

    socket.on('typing:update', ({ channelId, userId, displayName, isTyping }) => {
      if (userId === state.me?.id) return;
      let map = state.typingUsersByChannel.get(channelId);
      if (!map) {
        map = new Map();
        state.typingUsersByChannel.set(channelId, map);
      }
      if (isTyping) {
        map.set(userId, displayName);
      } else {
        map.delete(userId);
      }
      if (channelId === state.activeChannelId) renderTypingBar();
    });

    socket.on('voice:states', (states) => {
      state.voiceStates = states || [];
      renderSidebar();
      renderVoiceConnectedBar();
      renderStage();
      if (state.mode === 'home') renderFriendsView();
    });

    socket.on('voice:speaking-update', ({ userId, speaking }) => {
      const v = state.voiceStates.find(s => s.userId === userId);
      if (v) v.speaking = speaking;
      document.querySelectorAll(`[data-voice-avatar="${userId}"]`).forEach(el => {
        el.classList.toggle('speaking', !!speaking);
      });
      document.querySelectorAll(`[data-stage-tile="${userId}"]`).forEach(el => {
        el.classList.toggle('speaking', !!speaking);
      });
    });

    socket.on('voice:soundboard', ({ displayName, soundId, label, emoji }) => {
      audioFX.playSoundboardEffect(soundId);
      showToast(`${emoji || '🔊'} ${displayName} tocou: ${label}`, 'info');
    });

    socket.on('call:incoming', ({ dmId, caller, participantIds }) => {
      if (!participantIds.includes(state.me?.id) || caller.id === state.me?.id) return;
      audioFX.playSoundboardEffect('bell');
      showToast(`📞 ${caller.displayName} iniciou uma chamada na DM! Clique para atender.`, 'success');
    });

    socket.on('network:updated', (net) => {
      state.network = net;
      renderTopHeader();
    });
  }

  async function loadChannelMessages(channelId) {
    if (!channelId) return;
    try {
      const res = await api(`/api/channels/${channelId}/messages`);
      state.messagesByChannel.set(channelId, res.messages || []);
      renderMessages(true);
    } catch (_e) {}
  }

  // ==================== RENDER FUNCTIONS ====================
  function renderAll() {
    renderServerRail();
    renderSidebar();
    renderVoiceConnectedBar();
    renderUserPanel();
    renderTopHeader();
    renderMainBody();
    renderMembersSidebar();
  }

  // 1. Server Rail
  function renderServerRail() {
    const rail = document.getElementById('server-rail');
    if (!rail) return;

    const pendingCount = state.friendships.filter(
      f => f.status === 'pending' && f.toUserId === state.me?.id
    ).length;

    let html = `
      <div class="rail-item ${state.mode === 'home' ? 'active' : ''}" data-action="go-home" title="Mensagens Diretas e Amigos">
        <span style="font-size: 22px;">💬</span>
        ${pendingCount > 0 ? `<span class="rail-badge">${pendingCount}</span>` : ''}
      </div>
      <div class="rail-divider"></div>
    `;

    for (const srv of state.servers) {
      const isActive = state.mode === 'server' && state.activeServerId === srv.id;
      const voiceInSrv = state.voiceStates.filter(v => v.serverId === srv.id).length;
      html += `
        <div class="rail-item ${isActive ? 'active' : ''}" data-server-id="${srv.id}" title="${escapeHtml(srv.name)}">
          <span>${escapeHtml(srv.icon || getInitials(srv.name))}</span>
          ${voiceInSrv > 0 ? `<span class="rail-badge" style="background: var(--green-360);">🔊</span>` : ''}
        </div>
      `;
    }

    html += `
      <div class="rail-divider"></div>
      <div class="rail-item action-btn" data-action="create-server" title="Criar um Servidor">+</div>
      <div class="rail-item action-btn" data-action="join-server" title="Entrar em um Servidor via Código de Convite">🧭</div>
      <div class="rail-item action-btn" data-action="open-network" title="Conectar Amigos em Redes Diferentes (Túnel HTTPS)">🌐</div>
    `;

    rail.innerHTML = html;

    rail.querySelector('[data-action="go-home"]')?.addEventListener('click', () => {
      state.mode = 'home';
      state.activeChannelId = null;
      renderAll();
    });

    rail.querySelectorAll('[data-server-id]').forEach(el => {
      el.addEventListener('click', async () => {
        const srvId = el.getAttribute('data-server-id');
        state.mode = 'server';
        state.activeServerId = srvId;
        const srv = getActiveServer();
        const firstChan = srv?.channels.find(c => c.type !== 'voice') || srv?.channels[0];
        state.activeChannelId = firstChan?.id || null;
        renderAll();
        if (state.activeChannelId) await loadChannelMessages(state.activeChannelId);
      });
    });

    rail.querySelector('[data-action="create-server"]')?.addEventListener('click', openCreateServerModal);
    rail.querySelector('[data-action="join-server"]')?.addEventListener('click', openJoinServerModal);
    rail.querySelector('[data-action="open-network"]')?.addEventListener('click', openNetworkModal);
  }

  // 2. Sidebar (Server Channels OR Direct Messages)
  function renderSidebar() {
    const header = document.getElementById('sidebar-header');
    const scroll = document.getElementById('sidebar-scroll');
    if (!header || !scroll) return;

    if (state.mode === 'home') {
      header.innerHTML = `
        <span>Mensagens Diretas</span>
        <button class="icon-btn" id="new-dm-btn" title="Nova Mensagem Direta">➕</button>
      `;
      header.onclick = null;
      document.getElementById('new-dm-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.friendsTab = 'add';
        state.activeChannelId = null;
        renderAll();
      });

      let html = `
        <div class="channel-item ${!state.activeChannelId ? 'active' : ''}" id="sidebar-friends-btn">
          <div class="channel-left">
            <span class="channel-icon">👥</span>
            <span>Amigos</span>
          </div>
        </div>
        <div class="category-block">
          <div class="category-header">
            <span>MENSAGENS DIRETAS</span>
          </div>
      `;

      for (const dm of state.dms) {
        const peer = getDmPeer(dm);
        const title = getDmTitle(dm);
        const isActive = state.activeChannelId === dm.id;
        const inCallCount = state.voiceStates.filter(v => v.channelId === dm.id).length;

        html += `
          <div class="channel-item ${isActive ? 'active' : ''}" data-dm-id="${dm.id}">
            <div class="channel-left">
              <div class="avatar-xs" style="background: ${peer?.avatarColor || '#5865F2'};">
                ${escapeHtml(getInitials(title))}
                <span class="status-dot ${peer?.status || 'offline'}" style="width:8px;height:8px;border-width:1.5px;"></span>
              </div>
              <span>${escapeHtml(title)}</span>
            </div>
            ${inCallCount > 0 ? `<span class="badge-live" style="background: var(--green-360);">📞 ${inCallCount}</span>` : ''}
          </div>
        `;
      }

      html += `</div>`;
      scroll.innerHTML = html;

      document.getElementById('sidebar-friends-btn')?.addEventListener('click', () => {
        state.activeChannelId = null;
        renderAll();
      });

      scroll.querySelectorAll('[data-dm-id]').forEach(el => {
        el.addEventListener('click', async () => {
          state.activeChannelId = el.getAttribute('data-dm-id');
          renderAll();
          await loadChannelMessages(state.activeChannelId);
        });
      });
      return;
    }

    // Server Mode Sidebar
    const srv = getActiveServer();
    if (!srv) return;

    header.innerHTML = `
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(srv.name)}</span>
      <div style="display:flex;gap:4px;">
        <button class="icon-btn" id="srv-invite-btn" title="Convidar Amigos">📨</button>
        <button class="icon-btn" id="srv-add-chan-btn" title="Criar Canal">➕</button>
      </div>
    `;
    header.onclick = openServerMenuModal;
    document.getElementById('srv-invite-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openInviteFriendsModal(srv);
    });
    document.getElementById('srv-add-chan-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openCreateChannelModal(srv);
    });

    let html = '';
    const categories = [...(srv.categories || [])].sort((a, b) => a.position - b.position);

    for (const cat of categories) {
      const isCollapsed = state.collapsedCategories.has(cat.id);
      const chans = (srv.channels || [])
        .filter(c => c.categoryId === cat.id)
        .sort((a, b) => a.position - b.position);

      html += `
        <div class="category-block">
          <div class="category-header" data-cat-id="${cat.id}">
            <span>${isCollapsed ? '▸' : '▾'} ${escapeHtml(cat.name)}</span>
            <button class="icon-btn" data-add-in-cat="${cat.id}" style="width:20px;height:20px;font-size:13px;" title="Criar Canal">+</button>
          </div>
      `;

      if (!isCollapsed) {
        for (const ch of chans) {
          const isVoice = ch.type === 'voice';
          const isActive = state.activeChannelId === ch.id || (isVoice && voiceEngine?.channelId === ch.id);
          const icon = isVoice ? '🔊' : ch.type === 'announcement' ? '📢' : '#';
          const voiceUsers = isVoice
            ? state.voiceStates.filter(v => v.channelId === ch.id)
            : [];

          html += `
            <div class="channel-item ${isActive ? 'active' : ''}" data-channel-id="${ch.id}" data-channel-type="${ch.type}">
              <div class="channel-left">
                <span class="channel-icon">${icon}</span>
                <span>${escapeHtml(ch.name)}</span>
              </div>
              ${
                voiceUsers.some(v => v.screenShare)
                  ? `<span class="badge-live">AO VIVO</span>`
                  : voiceUsers.length > 0
                    ? `<span style="font-size:11px;color:var(--text-muted);">${voiceUsers.length}</span>`
                    : ''
              }
            </div>
          `;

          if (isVoice && voiceUsers.length > 0) {
            html += `<div class="voice-sidebar-users">`;
            for (const vu of voiceUsers) {
              const u = getUser(vu.userId);
              html += `
                <div class="voice-sidebar-user" data-voice-user="${u.id}" data-voice-chan="${ch.id}">
                  <div class="voice-sidebar-user-left">
                    <div class="avatar-xs ${vu.speaking ? 'speaking' : ''}" data-voice-avatar="${u.id}" style="background:${u.avatarColor};">
                      ${escapeHtml(getInitials(u.displayName))}
                    </div>
                    <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(u.displayName)}</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:4px;">
                    ${vu.screenShare ? `<span class="badge-live" title="Transmitindo tela">AO VIVO</span>` : ''}
                    ${vu.video ? `<span title="Câmera ligada">📹</span>` : ''}
                    ${vu.selfMute ? `<span title="Microfone silenciado" style="color:var(--red-400);">🔇</span>` : ''}
                    ${vu.selfDeaf ? `<span title="Áudio desativado" style="color:var(--red-400);">🧏</span>` : ''}
                  </div>
                </div>
              `;
            }
            html += `</div>`;
          }
        }
      }

      html += `</div>`;
    }

    scroll.innerHTML = html;

    scroll.querySelectorAll('[data-cat-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-add-in-cat]')) return;
        const catId = el.getAttribute('data-cat-id');
        if (state.collapsedCategories.has(catId)) state.collapsedCategories.delete(catId);
        else state.collapsedCategories.add(catId);
        renderSidebar();
      });
    });

    scroll.querySelectorAll('[data-add-in-cat]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openCreateChannelModal(srv, btn.getAttribute('data-add-in-cat'));
      });
    });

    scroll.querySelectorAll('[data-channel-id]').forEach(el => {
      el.addEventListener('click', async () => {
        const chId = el.getAttribute('data-channel-id');
        const chType = el.getAttribute('data-channel-type');
        state.activeChannelId = chId;
        if (chType === 'voice') {
          state.stageCollapsedInText = false;
          await voiceEngine.joinChannel(chId, srv.id);
        } else {
          await loadChannelMessages(chId);
        }
        renderAll();
      });
    });

    scroll.querySelectorAll('[data-voice-user]').forEach(el => {
      el.addEventListener('click', async () => {
        const chId = el.getAttribute('data-voice-chan');
        const uId = el.getAttribute('data-voice-user');
        state.activeChannelId = chId;
        if (voiceEngine.channelId !== chId) {
          await voiceEngine.joinChannel(chId, srv.id);
        }
        const vu = state.voiceStates.find(v => v.userId === uId);
        if (vu?.screenShare) {
          state.stageLayout = 'spotlight';
          state.focusedTileKey = `${uId}:screen`;
        }
        renderAll();
      });
    });
  }

  // 2b. Connected Voice Bar (above User Panel)
  function renderVoiceConnectedBar() {
    const bar = document.getElementById('voice-connected-bar');
    if (!bar) return;

    if (!voiceEngine || !voiceEngine.channelId) {
      bar.classList.add('hidden');
      return;
    }

    bar.classList.remove('hidden');
    let chanName = 'Chamada de Voz';
    let srvName = 'Mensagem Direta';
    for (const s of state.servers) {
      const ch = s.channels.find(c => c.id === voiceEngine.channelId);
      if (ch) {
        chanName = ch.name;
        srvName = s.name;
        break;
      }
    }
    const dm = state.dms.find(d => d.id === voiceEngine.channelId);
    if (dm) {
      chanName = getDmTitle(dm);
    }

    bar.innerHTML = `
      <div class="voice-status-row">
        <div>
          <div class="voice-signal-title">
            <span>📶 Voz Conectada</span>
            <span id="voice-rtt-badge" style="font-size:11px;background:rgba(35,165,90,0.18);padding:1px 5px;border-radius:4px;">${voiceEngine.lastRtt} ms</span>
          </div>
          <div class="voice-channel-sub">${escapeHtml(chanName)} / ${escapeHtml(srvName)}</div>
        </div>
        <button class="icon-btn danger-active" id="voice-bar-disconnect" title="Desconectar">📞</button>
      </div>
      <div class="voice-quick-actions">
        <button class="voice-quick-btn ${voiceEngine.videoEnabled ? 'active' : ''}" id="voice-bar-cam">
          📹 Vídeo
        </button>
        <button class="voice-quick-btn ${voiceEngine.screenShareEnabled ? 'active' : ''}" id="voice-bar-screen">
          🖥️ Tela
        </button>
        <button class="voice-quick-btn" id="voice-bar-soundboard">
          🔊 Sons
        </button>
      </div>
    `;

    document.getElementById('voice-bar-disconnect')?.addEventListener('click', () => {
      voiceEngine.leaveChannel();
    });
    document.getElementById('voice-bar-cam')?.addEventListener('click', () => {
      voiceEngine.setVideoBroadcast(!voiceEngine.videoEnabled);
    });
    document.getElementById('voice-bar-screen')?.addEventListener('click', () => {
      if (voiceEngine.screenShareEnabled) {
        voiceEngine.clearDesktopSource();
      } else {
        openGoLiveModal();
      }
    });
    document.getElementById('voice-bar-soundboard')?.addEventListener('click', openSoundboardModal);
  }

  // 2c. Bottom User Panel
  function renderUserPanel() {
    const panel = document.getElementById('user-panel');
    if (!panel || !state.me) return;

    const isMuted = voiceEngine?.selfMute || false;
    const isDeaf = voiceEngine?.selfDeaf || false;

    panel.innerHTML = `
      <div class="user-panel-profile" id="open-profile-quick">
        <div class="avatar-sm" style="background: ${state.me.avatarColor};">
          ${escapeHtml(getInitials(state.me.displayName))}
          <span class="status-dot ${state.me.rawStatus || state.me.status || 'online'}"></span>
        </div>
        <div class="user-panel-names">
          <div class="user-panel-display">${escapeHtml(state.me.displayName)}</div>
          <div class="user-panel-sub">${escapeHtml(state.me.customStatus || `@${state.me.username}`)}</div>
        </div>
      </div>
      <div class="user-panel-controls">
        <button class="icon-btn ${isMuted ? 'danger-active' : ''}" id="btn-self-mute" title="Silenciar Microfone (Ctrl+Shift+M)">
          ${isMuted ? '🔇' : '🎙️'}
        </button>
        <button class="icon-btn ${isDeaf ? 'danger-active' : ''}" id="btn-self-deaf" title="Desativar Áudio (Ctrl+Shift+D)">
          ${isDeaf ? '🧏' : '🎧'}
        </button>
        <button class="icon-btn" id="btn-user-settings" title="Configurações de Usuário">⚙️</button>
      </div>
    `;

    document.getElementById('open-profile-quick')?.addEventListener('click', openUserSettingsModal);
    document.getElementById('btn-self-mute')?.addEventListener('click', () => {
      voiceEngine?.setSelfMute(!voiceEngine.selfMute);
    });
    document.getElementById('btn-self-deaf')?.addEventListener('click', () => {
      voiceEngine?.setSelfDeafen(!voiceEngine.selfDeaf);
    });
    document.getElementById('btn-user-settings')?.addEventListener('click', openUserSettingsModal);
  }

  // 3. Top Header Bar
  function renderTopHeader() {
    const header = document.getElementById('top-header');
    if (!header) return;

    const tunnelActive = state.network?.tunnel?.active;
    const tunnelLabel = tunnelActive ? '🌐 Multi-Rede Ativo' : '🌐 Convidar Amigos (Multi-Rede)';

    if (state.mode === 'home' && !state.activeChannelId) {
      header.innerHTML = `
        <div class="top-header-left">
          <span style="font-size:18px;">👥</span>
          <span class="header-channel-name">Amigos</span>
          <div style="display:flex;gap:6px;margin-left:12px;">
            <button class="header-pill-btn ${state.friendsTab === 'online' ? 'network-live' : ''}" data-ftab="online">Disponível</button>
            <button class="header-pill-btn ${state.friendsTab === 'all' ? 'network-live' : ''}" data-ftab="all">Todos</button>
            <button class="header-pill-btn ${state.friendsTab === 'pending' ? 'network-live' : ''}" data-ftab="pending">Pendente</button>
            <button class="btn-success" style="padding:4px 10px;font-size:12px;" data-ftab="add">Adicionar Amigo</button>
          </div>
        </div>
        <div class="top-header-right">
          <button class="header-pill-btn ${tunnelActive ? 'network-live' : ''}" id="hdr-network-btn">${tunnelLabel}</button>
          <button class="header-pill-btn rea-btn" id="hdr-rea-btn">🔬 REA Inspector</button>
        </div>
      `;

      header.querySelectorAll('[data-ftab]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.friendsTab = btn.getAttribute('data-ftab');
          renderTopHeader();
          renderFriendsView();
        });
      });
      document.getElementById('hdr-network-btn')?.addEventListener('click', openNetworkModal);
      document.getElementById('hdr-rea-btn')?.addEventListener('click', openReaInspectorModal);
      return;
    }

    const ch = getActiveChannel();
    const isDm = state.mode === 'home' && ch;
    const icon = isDm ? '@' : ch?.type === 'voice' ? '🔊' : ch?.type === 'announcement' ? '📢' : '#';
    const title = isDm ? getDmTitle(ch) : (ch?.name || 'geral');
    const topic = isDm ? 'Chamada de voz, vídeo e compartilhamento de tela privado' : (ch?.topic || '');

    const channelMsgs = state.messagesByChannel.get(state.activeChannelId) || [];
    const pinnedCount = channelMsgs.filter(m => m.pinned).length;

    header.innerHTML = `
      <div class="top-header-left">
        <span style="font-size:18px;color:var(--text-muted);font-weight:700;">${icon}</span>
        <span class="header-channel-name">${escapeHtml(title)}</span>
        ${topic ? `<span class="header-topic">${escapeHtml(topic)}</span>` : ''}
      </div>
      <div class="top-header-right">
        ${
          isDm
            ? `
          <button class="header-pill-btn" id="hdr-dm-call" title="Iniciar Chamada de Voz na DM">📞 Call</button>
          <button class="header-pill-btn" id="hdr-dm-screen" title="Compartilhar Tela na DM">🖥️ Tela</button>
        `
            : ''
        }
        <button class="header-pill-btn ${tunnelActive ? 'network-live' : ''}" id="hdr-network-btn" title="Link público para amigos em outras redes">
          ${tunnelLabel}
        </button>
        <button class="header-pill-btn rea-btn" id="hdr-rea-btn" title="Ver evidências extraídas do Discord com morluto/rea">
          🔬 REA
        </button>
        <button class="icon-btn" id="hdr-pins-btn" title="Mensagens Fixadas (${pinnedCount})">
          📌${pinnedCount > 0 ? `<span style="font-size:10px;font-weight:700;">${pinnedCount}</span>` : ''}
        </button>
        <input id="hdr-search-input" class="search-input" type="text" placeholder="Buscar..." value="${escapeHtml(state.searchQuery)}" />
        ${
          state.mode === 'server'
            ? `<button class="icon-btn" id="hdr-members-toggle" title="Mostrar/Ocultar Lista de Membros">👥</button>`
            : ''
        }
      </div>
    `;

    document.getElementById('hdr-network-btn')?.addEventListener('click', openNetworkModal);
    document.getElementById('hdr-rea-btn')?.addEventListener('click', openReaInspectorModal);
    document.getElementById('hdr-pins-btn')?.addEventListener('click', openPinnedMessagesModal);
    document.getElementById('hdr-members-toggle')?.addEventListener('click', () => {
      state.showMembersSidebar = !state.showMembersSidebar;
      renderMembersSidebar();
    });

    document.getElementById('hdr-dm-call')?.addEventListener('click', async () => {
      if (!ch) return;
      await voiceEngine.joinChannel(ch.id, null);
      socket.emit('call:ring', { dmId: ch.id, channelName: getDmTitle(ch) });
      renderAll();
    });

    document.getElementById('hdr-dm-screen')?.addEventListener('click', async () => {
      if (!ch) return;
      if (voiceEngine.channelId !== ch.id) {
        await voiceEngine.joinChannel(ch.id, null);
        socket.emit('call:ring', { dmId: ch.id, channelName: getDmTitle(ch) });
      }
      openGoLiveModal();
      renderAll();
    });

    const searchInput = document.getElementById('hdr-search-input');
    searchInput?.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderMessages(false);
    });
  }

  // 4. Main Center Body (Friends vs Voice Stage vs Chat)
  function renderMainBody() {
    const friendsView = document.getElementById('friends-view');
    const chatView = document.getElementById('chat-view');
    const stageEl = document.getElementById('voice-stage');

    if (state.mode === 'home' && !state.activeChannelId) {
      friendsView.classList.remove('hidden');
      chatView.classList.add('hidden');
      stageEl.classList.add('hidden');
      renderFriendsView();
      return;
    }

    friendsView.classList.add('hidden');
    const ch = getActiveChannel();
    const isViewingVoiceChannel = ch?.type === 'voice';
    const isConnectedToAnyVoice = Boolean(voiceEngine?.channelId);

    if (isViewingVoiceChannel) {
      // Full-height Voice & Screen Share Stage
      stageEl.classList.remove('hidden', 'split-height');
      stageEl.classList.add('full-height');
      chatView.classList.add('hidden');
      renderStage();
    } else if (isConnectedToAnyVoice && !state.stageCollapsedInText) {
      // Split view: Watch screen share / call at top while chatting below!
      stageEl.classList.remove('hidden', 'full-height');
      stageEl.classList.add('split-height');
      chatView.classList.remove('hidden');
      renderStage();
      renderMessages(false);
    } else {
      stageEl.classList.add('hidden');
      chatView.classList.remove('hidden');
      renderMessages(false);
    }

    const textarea = document.getElementById('chat-textarea');
    if (textarea && ch) {
      textarea.placeholder = state.mode === 'home'
        ? `Conversar com @${getDmTitle(ch)}`
        : `Conversar em #${ch.name}`;
    }
  }

  // ==================== VOICE / VIDEO / SCREEN SHARE STAGE (GO LIVE) ====================
  function renderStage() {
    const stageEl = document.getElementById('voice-stage');
    if (!stageEl || stageEl.classList.contains('hidden')) return;

    const targetVoiceChannelId =
      getActiveChannel()?.type === 'voice'
        ? getActiveChannel().id
        : voiceEngine?.channelId;

    if (!targetVoiceChannelId) {
      stageEl.classList.add('hidden');
      return;
    }

    const participants = state.voiceStates.filter(v => v.channelId === targetVoiceChannelId);
    const isMeInThisChannel = voiceEngine?.channelId === targetVoiceChannelId;

    // Build tiles: each participant gets a participant/webcam tile, PLUS if screenShare is true, a dedicated Go Live Screen Share tile!
    const tiles = [];
    for (const p of participants) {
      const u = getUser(p.userId);
      const isMe = p.userId === state.me?.id;
      const peerObj = isMe ? null : voiceEngine?.peers.get(p.userId);

      // 1) Screen Share Tile (if user is streaming screen)
      if (p.screenShare) {
        const stream = isMe ? voiceEngine.screenStream : peerObj?.screenStream;
        const relayFrame = state.relayFramesByUser.get(p.userId);
        const resLabel = p.streamOptions ? `${p.streamOptions.resolution}p ${p.streamOptions.fps}FPS` : 'HD';
        tiles.push({
          key: `${p.userId}:screen`,
          userId: p.userId,
          user: u,
          kind: 'screen',
          isMe,
          stream,
          relayFrame,
          speaking: p.speaking,
          badge: `AO VIVO • ${resLabel}`,
          title: `Tela de ${u.displayName}`
        });
      }

      // 2) Participant / Webcam Tile
      const camStream = isMe ? voiceEngine.camStream : peerObj?.camStream;
      tiles.push({
        key: `${p.userId}:user`,
        userId: p.userId,
        user: u,
        kind: camStream ? 'cam' : 'avatar',
        isMe,
        stream: camStream || null,
        speaking: p.speaking,
        selfMute: p.selfMute,
        selfDeaf: p.selfDeaf,
        title: u.displayName
      });
    }

    // Auto-focus first screen share tile if none focused
    const screenTile = tiles.find(t => t.kind === 'screen');
    if (screenTile && (!state.focusedTileKey || !tiles.some(t => t.key === state.focusedTileKey))) {
      state.focusedTileKey = screenTile.key;
      state.stageLayout = 'spotlight';
    } else if (!tiles.some(t => t.key === state.focusedTileKey)) {
      state.focusedTileKey = tiles[0]?.key || null;
    }

    const useSpotlight = state.stageLayout === 'spotlight' && tiles.length > 1 && state.focusedTileKey;
    const focusedTile = useSpotlight ? (tiles.find(t => t.key === state.focusedTileKey) || tiles[0]) : null;
    const stripTiles = useSpotlight ? tiles.filter(t => t.key !== focusedTile.key) : tiles;

    function buildTileHtml(t) {
      const isCover = state.coverFitTiles.has(t.key);
      const vol = voiceEngine?.getLocalVolume(t.userId) ?? 100;
      return `
        <div class="stage-tile ${t.kind === 'screen' ? 'screen-tile' : ''} ${t.speaking ? 'speaking' : ''} ${isCover ? 'cover-fit' : ''}"
             data-stage-tile="${t.userId}" data-tile-key="${t.key}" id="tile-${t.key.replace(':', '-')}">
          ${
            t.kind === 'screen' || t.kind === 'cam'
              ? `
                <video id="vid-${t.key.replace(':', '-')}" autoplay playsinline ${t.isMe ? 'muted' : ''}></video>
                ${
                  t.kind === 'screen' && !t.isMe
                    ? `<img id="relay-img-${t.userId}" class="relay-canvas ${t.stream ? 'hidden' : ''}" src="${t.relayFrame?.dataUrl || ''}" alt="Stream" />`
                    : ''
                }
              `
              : `
                <div class="tile-avatar-big" style="background: ${t.user.avatarColor};">
                  ${escapeHtml(getInitials(t.user.displayName))}
                </div>
              `
          }

          <div class="tile-overlay-top">
            <div>
              ${t.badge ? `<span class="badge-live">🔴 ${escapeHtml(t.badge)}</span>` : ''}
            </div>
            <div class="tile-controls">
              <button class="tile-btn" data-focus-tile="${t.key}" title="Destacar no Palco">🔍 Focar</button>
              ${
                t.kind === 'screen' || t.kind === 'cam'
                  ? `
                    <button class="tile-btn" data-fit-tile="${t.key}" title="Alternar Ajuste / Preencher">📐 Zoom</button>
                    <button class="tile-btn" data-pip-tile="vid-${t.key.replace(':', '-')}" title="Picture-in-Picture">🖼️ PiP</button>
                    <button class="tile-btn" data-fs-tile="tile-${t.key.replace(':', '-')}" title="Tela Cheia">⛶ Tela Cheia</button>
                  `
                  : ''
              }
              ${
                !t.isMe
                  ? `
                    <button class="tile-btn" data-vol-user="${t.userId}" title="Ajustar Volume Individual (${vol}%)">🔊 ${vol}%</button>
                    <button class="tile-btn" data-mls-user="${t.userId}" title="Verificar Criptografia Ponta-a-Ponta DAVE/MLS">🔐 E2EE</button>
                  `
                  : ''
              }
            </div>
          </div>

          <div class="tile-overlay-bottom">
            <div class="tile-name-pill">
              <span>${escapeHtml(t.title)}</span>
              ${t.selfMute ? `<span style="color:var(--red-400);">🔇</span>` : ''}
              ${t.selfDeaf ? `<span style="color:var(--red-400);">🧏</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    stageEl.innerHTML = `
      <div class="stage-top-bar">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-weight:700;color:#fff;">🔊 Palco de Voz & Transmissão (Go Live)</span>
          <span style="font-size:12px;color:var(--text-muted);">${participants.length} participante(s)</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="header-pill-btn" id="stage-toggle-layout">
            ${state.stageLayout === 'spotlight' ? '⊞ Grade' : '🎯 Destaque'}
          </button>
          ${
            getActiveChannel()?.type !== 'voice'
              ? `<button class="header-pill-btn" id="stage-minimize-btn">▾ Ocultar Palco</button>`
              : ''
          }
        </div>
      </div>

      ${
        useSpotlight
          ? `
            <div class="stage-grid spotlight-layout">
              <div class="spotlight-main">${buildTileHtml(focusedTile)}</div>
              <div class="spotlight-strip">${stripTiles.map(buildTileHtml).join('')}</div>
            </div>
          `
          : `
            <div class="stage-grid">
              ${
                tiles.length > 0
                  ? tiles.map(buildTileHtml).join('')
                  : `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted);gap:10px;">
                       <div style="font-size:38px;">🎧</div>
                       <div>Ninguém conectado ainda. Clique em <strong>Entrar na Voz</strong> abaixo!</div>
                     </div>`
              }
            </div>
          `
      }

      <div class="stage-dock">
        ${
          !isMeInThisChannel
            ? `
              <button class="dock-btn active-green" id="dock-join-voice">
                🔊 Entrar no Canal de Voz
              </button>
            `
            : `
              <button class="dock-btn ${voiceEngine.selfMute ? 'active-red' : ''}" id="dock-mute">
                ${voiceEngine.selfMute ? '🔇 Microfone Mudo' : '🎙️ Microfone'}
              </button>
              <button class="dock-btn ${voiceEngine.selfDeaf ? 'active-red' : ''}" id="dock-deaf">
                ${voiceEngine.selfDeaf ? '🧏 Áudio Desativado' : '🎧 Áudio'}
              </button>
              <button class="dock-btn ${voiceEngine.videoEnabled ? 'active-green' : ''}" id="dock-cam">
                📹 ${voiceEngine.videoEnabled ? 'Desligar Câmera' : 'Câmera'}
              </button>
              <button class="dock-btn ${voiceEngine.screenShareEnabled ? 'active-green' : ''}" id="dock-screen">
                🖥️ ${voiceEngine.screenShareEnabled ? 'Parar Transmissão (AO VIVO)' : 'Compartilhar Tela (Go Live)'}
              </button>
              <button class="dock-btn" id="dock-soundboard">
                🔊 Soundboard
              </button>
              <button class="dock-btn active-red" id="dock-leave">
                📞 Desconectar
              </button>
            `
        }
      </div>
    `;

    // Bind MediaStream objects to <video> elements
    for (const t of tiles) {
      if (t.stream && (t.kind === 'screen' || t.kind === 'cam')) {
        const vid = document.getElementById(`vid-${t.key.replace(':', '-')}`);
        if (vid && vid.srcObject !== t.stream) {
          vid.srcObject = t.stream;
          vid.play().catch(() => {});
        }
      }
    }

    // Bind Stage Controls
    document.getElementById('stage-toggle-layout')?.addEventListener('click', () => {
      state.stageLayout = state.stageLayout === 'spotlight' ? 'grid' : 'spotlight';
      renderStage();
    });

    document.getElementById('stage-minimize-btn')?.addEventListener('click', () => {
      state.stageCollapsedInText = true;
      renderMainBody();
    });

    document.getElementById('dock-join-voice')?.addEventListener('click', () => {
      voiceEngine.joinChannel(targetVoiceChannelId, getActiveServer()?.id || null);
    });
    document.getElementById('dock-mute')?.addEventListener('click', () => {
      voiceEngine.setSelfMute(!voiceEngine.selfMute);
    });
    document.getElementById('dock-deaf')?.addEventListener('click', () => {
      voiceEngine.setSelfDeafen(!voiceEngine.selfDeaf);
    });
    document.getElementById('dock-cam')?.addEventListener('click', () => {
      voiceEngine.setVideoBroadcast(!voiceEngine.videoEnabled);
    });
    document.getElementById('dock-screen')?.addEventListener('click', () => {
      if (voiceEngine.screenShareEnabled) voiceEngine.clearDesktopSource();
      else openGoLiveModal();
    });
    document.getElementById('dock-soundboard')?.addEventListener('click', openSoundboardModal);
    document.getElementById('dock-leave')?.addEventListener('click', () => {
      voiceEngine.leaveChannel();
    });

    stageEl.querySelectorAll('[data-focus-tile]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.focusedTileKey = btn.getAttribute('data-focus-tile');
        state.stageLayout = 'spotlight';
        renderStage();
      });
    });

    stageEl.querySelectorAll('[data-fit-tile]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = btn.getAttribute('data-fit-tile');
        if (state.coverFitTiles.has(k)) state.coverFitTiles.delete(k);
        else state.coverFitTiles.add(k);
        renderStage();
      });
    });

    stageEl.querySelectorAll('[data-fs-tile]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const el = document.getElementById(btn.getAttribute('data-fs-tile'));
        if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
      });
    });

    stageEl.querySelectorAll('[data-pip-tile]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const vid = document.getElementById(btn.getAttribute('data-pip-tile'));
        if (vid?.requestPictureInPicture) vid.requestPictureInPicture().catch(() => {});
      });
    });

    stageEl.querySelectorAll('[data-vol-user]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openUserVolumeModal(btn.getAttribute('data-vol-user'));
      });
    });

    stageEl.querySelectorAll('[data-mls-user]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const peerId = btn.getAttribute('data-mls-user');
        const info = await voiceEngine.getMLSPairwiseFingerprint(peerId);
        openMlsFingerprintModal(peerId, info);
      });
    });
  }

  // ==================== CHAT MESSAGES RENDER & MARKDOWN ====================
  function formatDiscordMarkdown(rawText) {
    let html = escapeHtml(rawText);

    // Code blocks ```lang ... ```
    html = html.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre><code>${code.trim()}</code></pre>`);
    // Inline code `...`
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // Headings
    html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
    // Blockquotes
    html = html.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');
    // Bold **...**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic *...*
    html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    // Underline __...__
    html = html.replace(/__([^_]+)__/g, '<u>$1</u>');
    // Strikethrough ~~...~~
    html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    // Spoilers ||...||
    html = html.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');
    // Mentions @username
    html = html.replace(/@([a-zA-Z0-9_.-]+)/g, '<span class="mention">@$1</span>');
    // Links
    html = html.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--text-link);">$1</a>'
    );

    return html;
  }

  function renderMessages(scrollToBottom = false) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const allMsgs = state.messagesByChannel.get(state.activeChannelId) || [];
    const q = state.searchQuery.trim().toLowerCase();
    const msgs = q
      ? allMsgs.filter(m => {
          const u = getUser(m.authorId);
          return (
            m.content.toLowerCase().includes(q) ||
            u.displayName.toLowerCase().includes(q) ||
            u.username.toLowerCase().includes(q)
          );
        })
      : allMsgs;

    let html = '';
    if (voiceEngine?.channelId && state.stageCollapsedInText) {
      html += `
        <div style="margin: 0 16px 12px 16px; padding: 10px 14px; background: rgba(35,165,90,0.16); border: 1px solid rgba(35,165,90,0.4); border-radius: 6px; display:flex; align-items:center; justify-content:space-between;">
          <span>🔊 Você está em uma chamada/transmissão ativa!</span>
          <button class="btn-success" id="restore-stage-btn" style="padding:4px 10px;font-size:12px;">Mostrar Palco de Vídeo/Tela</button>
        </div>
      `;
    }

    let prevAuthorId = null;
    let prevTime = 0;

    for (const msg of msgs) {
      const author = getUser(msg.authorId);
      const msgTime = new Date(msg.createdAt).getTime();
      const isGrouped =
        !msg.replyToId &&
        prevAuthorId === msg.authorId &&
        msgTime - prevTime < 5 * 60 * 1000;
      prevAuthorId = msg.authorId;
      prevTime = msgTime;

      const replyTarget = msg.replyToId ? allMsgs.find(m => m.id === msg.replyToId) : null;
      const replyAuthor = replyTarget ? getUser(replyTarget.authorId) : null;

      // Check if message contains a Server Invite token [INVITE:CODE]
      const inviteMatch = msg.content.match(/\[INVITE:([A-Z0-9-]+)\]/i);
      const inviteSrv = inviteMatch
        ? state.allPublicServers.find(s => s.inviteCode.toUpperCase() === inviteMatch[1].toUpperCase()) ||
          state.servers.find(s => s.inviteCode.toUpperCase() === inviteMatch[1].toUpperCase())
        : null;

      const reactionsEntries = Object.entries(msg.reactions || {});

      html += `
        <div class="msg-row ${isGrouped ? 'grouped' : ''}" data-msg-id="${msg.id}">
          ${
            !isGrouped
              ? `
                <div class="msg-avatar" style="background: ${author.avatarColor};" data-profile-uid="${author.id}">
                  ${escapeHtml(getInitials(author.displayName))}
                </div>
              `
              : ''
          }

          ${
            replyTarget
              ? `
                <div class="msg-reply-preview">
                  <strong style="color:var(--text-header);">@${escapeHtml(replyAuthor.displayName)}</strong>
                  <span>${escapeHtml(replyTarget.content.slice(0, 70))}</span>
                </div>
              `
              : ''
          }

          ${
            !isGrouped
              ? `
                <div class="msg-header">
                  <span class="msg-author" data-profile-uid="${author.id}">${escapeHtml(author.displayName)}</span>
                  ${author.isBot ? `<span class="bot-tag">BOT</span>` : ''}
                  <span class="msg-time">${formatTime(msg.createdAt)}</span>
                  ${msg.pinned ? `<span title="Mensagem Fixada" style="font-size:12px;">📌</span>` : ''}
                </div>
              `
              : ''
          }

          <div class="msg-content">${formatDiscordMarkdown(msg.content)}${
            msg.editedAt ? ` <span style="font-size:11px;color:var(--text-muted);">(editado)</span>` : ''
          }</div>

          ${
            inviteSrv
              ? `
                <div class="invite-embed-card">
                  <div>
                    <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Convite para entrar em um servidor</div>
                    <div style="font-size:16px;font-weight:700;color:var(--text-header);margin-top:2px;">${escapeHtml(inviteSrv.name)}</div>
                    <div style="font-size:12px;color:var(--text-muted);">Código: ${escapeHtml(inviteSrv.inviteCode)}</div>
                  </div>
                  <button class="btn-success" data-join-invite-code="${escapeHtml(inviteSrv.inviteCode)}">Entrar</button>
                </div>
              `
              : ''
          }

          ${
            msg.attachments?.length
              ? `
                <div class="msg-attachments">
                  ${msg.attachments
                    .map(att => {
                      if (att.kind === 'image') {
                        return `<img class="att-image" src="${att.url}" alt="${escapeHtml(att.name)}" onclick="window.open('${att.url}', '_blank')" />`;
                      }
                      if (att.kind === 'video') {
                        return `<video class="att-video" src="${att.url}" controls preload="metadata"></video>`;
                      }
                      if (att.kind === 'audio') {
                        return `<audio src="${att.url}" controls></audio>`;
                      }
                      return `<a class="att-file" href="${att.url}" download="${escapeHtml(att.name)}">📄 ${escapeHtml(att.name)}</a>`;
                    })
                    .join('')}
                </div>
              `
              : ''
          }

          ${
            reactionsEntries.length
              ? `
                <div class="msg-reactions">
                  ${reactionsEntries
                    .map(([emoji, users]) => {
                      const iReacted = users.includes(state.me?.id);
                      return `
                        <div class="reaction-pill ${iReacted ? 'me' : ''}" data-react-msg="${msg.id}" data-react-emoji="${escapeHtml(emoji)}">
                          <span>${escapeHtml(emoji)}</span>
                          <span>${users.length}</span>
                        </div>
                      `;
                    })
                    .join('')}
                </div>
              `
              : ''
          }

          <!-- Hover Action Toolbar -->
          <div class="msg-actions-bar">
            <button class="msg-action-btn" data-react-msg="${msg.id}" data-react-emoji="👍" title="Reagir 👍">👍</button>
            <button class="msg-action-btn" data-react-msg="${msg.id}" data-react-emoji="❤️" title="Reagir ❤️">❤️</button>
            <button class="msg-action-btn" data-react-msg="${msg.id}" data-react-emoji="🔥" title="Reagir 🔥">🔥</button>
            <button class="msg-action-btn" data-react-msg="${msg.id}" data-react-emoji="😂" title="Reagir 😂">😂</button>
            <button class="msg-action-btn" data-reply-msg="${msg.id}" title="Responder">↩️</button>
            <button class="msg-action-btn" data-pin-msg="${msg.id}" title="Fixar/Desafixar">📌</button>
            ${
              msg.authorId === state.me?.id
                ? `
                  <button class="msg-action-btn" data-edit-msg="${msg.id}" title="Editar">✏️</button>
                  <button class="msg-action-btn" data-del-msg="${msg.id}" title="Excluir">🗑️</button>
                `
                : ''
            }
          </div>
        </div>
      `;
    }

    container.innerHTML = html;

    document.getElementById('restore-stage-btn')?.addEventListener('click', () => {
      state.stageCollapsedInText = false;
      renderMainBody();
    });

    container.querySelectorAll('[data-react-msg]').forEach(el => {
      el.addEventListener('click', async () => {
        const msgId = el.getAttribute('data-react-msg');
        const emoji = el.getAttribute('data-react-emoji');
        await api(`/api/messages/${msgId}/reactions`, {
          method: 'POST',
          body: { channelId: state.activeChannelId, emoji }
        });
      });
    });

    container.querySelectorAll('[data-reply-msg]').forEach(el => {
      el.addEventListener('click', () => {
        const msgId = el.getAttribute('data-reply-msg');
        const target = allMsgs.find(m => m.id === msgId);
        if (target) {
          state.replyingTo = target;
          renderReplyBanner();
          document.getElementById('chat-textarea')?.focus();
        }
      });
    });

    container.querySelectorAll('[data-pin-msg]').forEach(el => {
      el.addEventListener('click', async () => {
        const msgId = el.getAttribute('data-pin-msg');
        await api(`/api/messages/${msgId}/pin`, {
          method: 'POST',
          body: { channelId: state.activeChannelId }
        });
        renderTopHeader();
      });
    });

    container.querySelectorAll('[data-edit-msg]').forEach(el => {
      el.addEventListener('click', () => {
        const msgId = el.getAttribute('data-edit-msg');
        const target = allMsgs.find(m => m.id === msgId);
        if (!target) return;
        state.editingMessageId = target.id;
        const textarea = document.getElementById('chat-textarea');
        if (textarea) {
          textarea.value = target.content;
          textarea.focus();
        }
        renderReplyBanner();
      });
    });

    container.querySelectorAll('[data-del-msg]').forEach(el => {
      el.addEventListener('click', async () => {
        const msgId = el.getAttribute('data-del-msg');
        await api(`/api/messages/${msgId}?channelId=${encodeURIComponent(state.activeChannelId)}`, {
          method: 'DELETE'
        });
      });
    });

    container.querySelectorAll('[data-join-invite-code]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.getAttribute('data-join-invite-code');
        try {
          const res = await api('/api/invites/join', { method: 'POST', body: { inviteCode: code } });
          if (res.server) {
            state.mode = 'server';
            state.activeServerId = res.server.id;
            state.activeChannelId = res.server.channels[0]?.id;
            showToast(`Entrou em ${res.server.name}!`, 'success');
            renderAll();
          }
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-profile-uid]').forEach(el => {
      el.addEventListener('click', () => {
        openUserProfileModal(el.getAttribute('data-profile-uid'));
      });
    });

    if (scrollToBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function renderReplyBanner() {
    const banner = document.getElementById('reply-banner');
    if (!banner) return;

    if (state.editingMessageId) {
      banner.classList.remove('hidden');
      banner.innerHTML = `
        <span>✏️ Editando mensagem (ESC para cancelar)</span>
        <button class="icon-btn" id="cancel-reply-btn">✖</button>
      `;
      document.getElementById('cancel-reply-btn').onclick = () => {
        state.editingMessageId = null;
        document.getElementById('chat-textarea').value = '';
        renderReplyBanner();
      };
      return;
    }

    if (!state.replyingTo) {
      banner.classList.add('hidden');
      return;
    }

    const u = getUser(state.replyingTo.authorId);
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <span>Respondendo a <strong>@${escapeHtml(u.displayName)}</strong></span>
      <button class="icon-btn" id="cancel-reply-btn">✖</button>
    `;
    document.getElementById('cancel-reply-btn').onclick = () => {
      state.replyingTo = null;
      renderReplyBanner();
    };
  }

  function renderStagedAttachments() {
    const box = document.getElementById('attachment-staging');
    if (!box) return;
    if (state.stagedAttachments.length === 0) {
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${state.stagedAttachments
          .map(
            (a, idx) =>
              `<span style="background:var(--bg-primary);padding:4px 8px;border-radius:4px;font-size:12px;">📎 ${escapeHtml(a.name)} <button data-rm-att="${idx}" style="margin-left:6px;color:var(--red-400);">✖</button></span>`
          )
          .join('')}
      </div>
    `;
    box.querySelectorAll('[data-rm-att]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-rm-att'));
        state.stagedAttachments.splice(i, 1);
        renderStagedAttachments();
      });
    });
  }

  function renderTypingBar() {
    const bar = document.getElementById('typing-bar');
    if (!bar) return;
    const map = state.typingUsersByChannel.get(state.activeChannelId);
    if (!map || map.size === 0) {
      bar.textContent = '';
      return;
    }
    const names = Array.from(map.values());
    bar.innerHTML = `<strong>${escapeHtml(names.join(', '))}</strong> está digitando...`;
  }

  // ==================== CHAT INPUT & UPLOADS ====================
  const chatTextarea = document.getElementById('chat-textarea');
  let typingTimeout = null;

  chatTextarea?.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      state.replyingTo = null;
      state.editingMessageId = null;
      renderReplyBanner();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await sendChatMessage();
    } else if (socket && state.activeChannelId) {
      socket.emit('typing:start', { channelId: state.activeChannelId });
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.emit('typing:stop', { channelId: state.activeChannelId });
      }, 2200);
    }
  });

  async function sendChatMessage() {
    const text = chatTextarea.value.trim();
    if (!text && state.stagedAttachments.length === 0) return;
    if (!state.activeChannelId) return;

    try {
      if (state.editingMessageId) {
        const editId = state.editingMessageId;
        state.editingMessageId = null;
        chatTextarea.value = '';
        renderReplyBanner();
        await api(`/api/messages/${editId}`, {
          method: 'PATCH',
          body: { channelId: state.activeChannelId, content: text }
        });
        return;
      }

      const attachments = [...state.stagedAttachments];
      const replyToId = state.replyingTo?.id || null;
      chatTextarea.value = '';
      state.stagedAttachments = [];
      state.replyingTo = null;
      renderReplyBanner();
      renderStagedAttachments();

      await api(`/api/channels/${state.activeChannelId}/messages`, {
        method: 'POST',
        body: { content: text, attachments, replyToId }
      });
      socket?.emit('typing:stop', { channelId: state.activeChannelId });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function uploadFiles(files) {
    for (const file of Array.from(files || [])) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await api('/api/upload', { method: 'POST', body: fd });
        if (res.attachment) {
          state.stagedAttachments.push(res.attachment);
          renderStagedAttachments();
        }
      } catch (err) {
        showToast(`Falha no upload: ${err.message}`, 'error');
      }
    }
  }

  document.getElementById('upload-btn')?.addEventListener('click', () => {
    document.getElementById('file-input')?.click();
  });
  document.getElementById('file-input')?.addEventListener('change', (e) => {
    uploadFiles(e.target.files);
    e.target.value = '';
  });

  // Paste image from clipboard directly into chat!
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) uploadFiles(files);
  });

  document.getElementById('invite-card-btn')?.addEventListener('click', async () => {
    const srv = getActiveServer() || state.servers[0];
    if (!srv || !state.activeChannelId) return;
    await api(`/api/channels/${state.activeChannelId}/messages`, {
      method: 'POST',
      body: {
        content: `📨 Venha entrar no servidor **${srv.name}**! [INVITE:${srv.inviteCode}]`
      }
    });
  });

  document.getElementById('emoji-picker-btn')?.addEventListener('click', () => {
    const emojis = ['😀', '😂', '🔥', '🚀', '❤️', '🎮', '🎉', '⚡', '👀', '💯', '🤝', '👑'];
    const pick = emojis[Math.floor(Math.random() * emojis.length)];
    chatTextarea.value += (chatTextarea.value ? ' ' : '') + pick;
    chatTextarea.focus();
  });

  // ==================== 5. FRIENDS HOME VIEW ====================
  function renderFriendsView() {
    const view = document.getElementById('friends-view');
    if (!view || view.classList.contains('hidden')) return;

    const accepted = state.friendships.filter(f => f.status === 'accepted');
    const pending = state.friendships.filter(f => f.status === 'pending');

    const friendUsers = accepted.map(f => {
      const otherId = f.fromUserId === state.me?.id ? f.toUserId : f.fromUserId;
      return getUser(otherId);
    });

    // Also show all registered users in "Todos" or "Adicionar" so friends on the server can easily find each other
    const allOtherUsers = Array.from(state.users.values()).filter(u => u.id !== state.me?.id);

    let leftHtml = '';
    if (state.friendsTab === 'add') {
      leftHtml = `
        <h3 style="color:var(--text-header);margin-bottom:6px;">ADICIONAR AMIGO</h3>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
          Você pode adicionar amigos pelo nome de usuário ou clicar diretamente em alguém conectado abaixo!
        </p>
        <div style="display:flex;gap:10px;margin-bottom:24px;">
          <input id="add-friend-input" class="form-input" type="text" placeholder="Digite um nome de usuário (ex: bernardo)" />
          <button id="send-friend-req-btn" class="btn-primary" style="width:auto;white-space:nowrap;">Enviar Pedido de Amizade</button>
        </div>

        <div class="member-group-title">MEMBROS NO SERVIDOR (${allOtherUsers.length})</div>
        ${allOtherUsers
          .map(
            u => `
          <div class="friend-card">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="avatar-sm" style="background:${u.avatarColor};">
                ${escapeHtml(getInitials(u.displayName))}
                <span class="status-dot ${u.status}"></span>
              </div>
              <div>
                <div style="font-weight:700;color:var(--text-header);">${escapeHtml(u.displayName)}</div>
                <div style="font-size:12px;color:var(--text-muted);">@${escapeHtml(u.username)}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn-secondary" data-start-dm="${u.id}">💬 Mensagem</button>
              <button class="btn-success" data-quick-add-friend="${u.id}">➕ Adicionar</button>
            </div>
          </div>
        `
          )
          .join('')}
      `;
    } else if (state.friendsTab === 'pending') {
      leftHtml = `
        <div class="member-group-title">SOLICITAÇÕES PENDENTES — ${pending.length}</div>
        ${
          pending.length === 0
            ? `<div style="color:var(--text-muted);padding:20px 0;">Nenhuma solicitação de amizade pendente.</div>`
            : pending
                .map(f => {
                  const isIncoming = f.toUserId === state.me?.id;
                  const u = getUser(isIncoming ? f.fromUserId : f.toUserId);
                  return `
                    <div class="friend-card">
                      <div style="display:flex;align-items:center;gap:10px;">
                        <div class="avatar-sm" style="background:${u.avatarColor};">${escapeHtml(getInitials(u.displayName))}</div>
                        <div>
                          <div style="font-weight:700;color:var(--text-header);">${escapeHtml(u.displayName)}</div>
                          <div style="font-size:12px;color:var(--text-muted);">${isIncoming ? 'Pedido Recebido' : 'Pedido Enviado'}</div>
                        </div>
                      </div>
                      <div style="display:flex;gap:8px;">
                        ${
                          isIncoming
                            ? `<button class="btn-success" data-frd-respond="${f.id}" data-frd-action="accept">✔ Aceitar</button>`
                            : ''
                        }
                        <button class="btn-danger" data-frd-respond="${f.id}" data-frd-action="reject">✖ Recusar</button>
                      </div>
                    </div>
                  `;
                })
                .join('')
        }
      `;
    } else {
      const listToShow =
        state.friendsTab === 'online'
          ? (friendUsers.length ? friendUsers : allOtherUsers).filter(u => u.status !== 'offline')
          : (friendUsers.length ? friendUsers : allOtherUsers);

      leftHtml = `
        <div class="member-group-title">${state.friendsTab === 'online' ? 'DISPONÍVEL' : 'TODOS OS AMIGOS'} — ${listToShow.length}</div>
        ${listToShow
          .map(
            u => `
          <div class="friend-card">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="avatar-sm" style="background:${u.avatarColor};">
                ${escapeHtml(getInitials(u.displayName))}
                <span class="status-dot ${u.status}"></span>
              </div>
              <div>
                <div style="font-weight:700;color:var(--text-header);">${escapeHtml(u.displayName)}</div>
                <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(u.customStatus || u.status)}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn-secondary" data-start-dm="${u.id}">💬 Conversar</button>
              <button class="btn-success" data-call-dm="${u.id}">📞 Ligar</button>
            </div>
          </div>
        `
          )
          .join('')}
      `;
    }

    // Active Now Column (shows who is in a voice channel or sharing screen right now!)
    const activeVoiceList = state.voiceStates;
    const rightHtml = `
      <h3 style="font-size:16px;font-weight:800;color:var(--text-header);margin-bottom:12px;">Ativos Agora</h3>
      ${
        activeVoiceList.length === 0
          ? `<div style="background:var(--bg-secondary);padding:16px;border-radius:8px;font-size:13px;color:var(--text-muted);">
               Quando um amigo entrar em um canal de voz ou transmitir a tela (Go Live), aparecerá aqui!
             </div>`
          : activeVoiceList
              .map(v => {
                const u = getUser(v.userId);
                return `
                  <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;margin-bottom:10px;border:1px solid var(--border-subtle);">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                      <div style="display:flex;align-items:center;gap:8px;">
                        <div class="avatar-xs" style="background:${u.avatarColor};">${escapeHtml(getInitials(u.displayName))}</div>
                        <strong style="color:var(--text-header);">${escapeHtml(u.displayName)}</strong>
                      </div>
                      ${v.screenShare ? `<span class="badge-live">AO VIVO</span>` : `<span style="font-size:12px;color:var(--green-360);">🔊 Em Voz</span>`}
                    </div>
                    <button class="btn-primary" style="padding:6px 10px;font-size:12px;" data-join-active-voice="${v.channelId}" data-join-active-srv="${v.serverId || ''}">
                      ${v.screenShare ? '🖥️ Assistir Transmissão' : '🔊 Entrar na Call'}
                    </button>
                  </div>
                `;
              })
              .join('')
      }
    `;

    view.innerHTML = `
      <div class="friends-list-col">${leftHtml}</div>
      <div class="friends-active-col">${rightHtml}</div>
    `;

    document.getElementById('send-friend-req-btn')?.addEventListener('click', async () => {
      const val = document.getElementById('add-friend-input')?.value.trim();
      if (!val) return;
      try {
        await api('/api/friends/request', { method: 'POST', body: { targetUsername: val } });
        showToast('Solicitação de amizade enviada!', 'success');
        state.friendsTab = 'pending';
        renderTopHeader();
        renderFriendsView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    view.querySelectorAll('[data-quick-add-friend]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/api/friends/request', {
            method: 'POST',
            body: { targetUserId: btn.getAttribute('data-quick-add-friend') }
          });
          showToast('Solicitação de amizade enviada!', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    view.querySelectorAll('[data-frd-respond]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api('/api/friends/respond', {
          method: 'POST',
          body: {
            friendshipId: btn.getAttribute('data-frd-respond'),
            action: btn.getAttribute('data-frd-action')
          }
        });
      });
    });

    view.querySelectorAll('[data-start-dm]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetUserId = btn.getAttribute('data-start-dm');
        const res = await api('/api/dms', { method: 'POST', body: { targetUserId } });
        if (res.dm) {
          if (!state.dms.some(d => d.id === res.dm.id)) state.dms.unshift(res.dm);
          state.mode = 'home';
          state.activeChannelId = res.dm.id;
          renderAll();
          await loadChannelMessages(res.dm.id);
        }
      });
    });

    view.querySelectorAll('[data-call-dm]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetUserId = btn.getAttribute('data-call-dm');
        const res = await api('/api/dms', { method: 'POST', body: { targetUserId } });
        if (res.dm) {
          if (!state.dms.some(d => d.id === res.dm.id)) state.dms.unshift(res.dm);
          state.mode = 'home';
          state.activeChannelId = res.dm.id;
          await voiceEngine.joinChannel(res.dm.id, null);
          socket.emit('call:ring', { dmId: res.dm.id, channelName: getDmTitle(res.dm) });
          renderAll();
          await loadChannelMessages(res.dm.id);
        }
      });
    });

    view.querySelectorAll('[data-join-active-voice]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const chId = btn.getAttribute('data-join-active-voice');
        const srvId = btn.getAttribute('data-join-active-srv');
        if (srvId) {
          state.mode = 'server';
          state.activeServerId = srvId;
        }
        state.activeChannelId = chId;
        await voiceEngine.joinChannel(chId, srvId || null);
        renderAll();
      });
    });
  }

  // ==================== 6. RIGHT MEMBERS SIDEBAR ====================
  function renderMembersSidebar() {
    const sidebar = document.getElementById('members-sidebar');
    if (!sidebar) return;

    if (state.mode !== 'server' || !state.showMembersSidebar) {
      sidebar.classList.add('hidden');
      return;
    }

    const srv = getActiveServer();
    if (!srv) {
      sidebar.classList.add('hidden');
      return;
    }

    sidebar.classList.remove('hidden');
    const memberUsers = (srv.members || []).map(m => getUser(m.userId));
    const online = memberUsers.filter(u => u.status !== 'offline');
    const offline = memberUsers.filter(u => u.status === 'offline');

    function renderMemberRow(u) {
      const vState = state.voiceStates.find(v => v.userId === u.id);
      return `
        <div class="member-row ${u.status === 'offline' ? 'offline' : ''}" data-profile-uid="${u.id}">
          <div class="avatar-sm" style="background:${u.avatarColor};">
            ${escapeHtml(getInitials(u.displayName))}
            <span class="status-dot ${u.status}"></span>
          </div>
          <div style="overflow:hidden;flex:1;">
            <div style="font-size:14px;font-weight:600;color:var(--text-header);display:flex;align-items:center;gap:5px;">
              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(u.displayName)}</span>
              ${u.isBot ? `<span class="bot-tag">BOT</span>` : ''}
            </div>
            <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${
                vState?.screenShare
                  ? '🔴 Transmitindo a tela'
                  : vState
                    ? '🔊 Em canal de voz'
                    : escapeHtml(u.customStatus || '')
              }
            </div>
          </div>
        </div>
      `;
    }

    sidebar.innerHTML = `
      <div class="member-group-title">ONLINE — ${online.length}</div>
      ${online.map(renderMemberRow).join('')}
      ${
        offline.length > 0
          ? `<div class="member-group-title">OFFLINE — ${offline.length}</div>${offline.map(renderMemberRow).join('')}`
          : ''
      }
    `;

    sidebar.querySelectorAll('[data-profile-uid]').forEach(el => {
      el.addEventListener('click', () => {
        openUserProfileModal(el.getAttribute('data-profile-uid'));
      });
    });
  }

  // ==================== 7. MODALS ====================
  const modalRoot = document.getElementById('modal-root');

  function showModal(html, wide = false) {
    modalRoot.innerHTML = `<div class="modal-box ${wide ? 'wide' : ''}">${html}</div>`;
    modalRoot.classList.remove('hidden');
    modalRoot.onclick = (e) => {
      if (e.target === modalRoot) closeModal();
    };
    modalRoot.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', closeModal);
    });
  }

  function closeModal() {
    modalRoot.classList.add('hidden');
    modalRoot.innerHTML = '';
  }

  // Go Live / Screen Share Quality & Options Modal (with Native Electron Desktop/Window Picker when in .EXE)
  async function openGoLiveModal() {
    let selectedRes = 1080;
    let selectedFps = 60;
    let selectedHint = 'motion';
    let includeAudio = true;
    let desktopSources = [];
    let selectedSourceId = null;

    if (window.DiscordNative?.desktopCapturer?.getSources) {
      try {
        desktopSources = await window.DiscordNative.desktopCapturer.getSources();
        if (desktopSources.length > 0) {
          selectedSourceId = desktopSources[0].id;
        }
      } catch (_e) {}
    }

    const hasNativeSources = desktopSources.length > 0;

    showModal(
      `
      <div class="modal-header">
        <div class="modal-title">🖥️ Compartilhar Tela (Go Live)</div>
        <button class="icon-btn" data-close-modal>✖</button>
      </div>
      <div class="modal-body">
        ${
          hasNativeSources
            ? `
              <div class="form-group">
                <label class="form-label">Selecione a Tela ou Janela / Jogo para Transmitir</label>
                <div id="native-sources-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:10px;max-height:240px;overflow-y:auto;padding:4px;">
                  ${desktopSources
                    .map(
                      (s, idx) => `
                    <div class="choice-pill ${idx === 0 ? 'selected' : ''}" data-source-id="${escapeHtml(s.id)}" style="padding:6px;display:flex;flex-direction:column;gap:6px;align-items:center;">
                      ${
                        s.thumbnailDataUrl
                          ? `<img src="${s.thumbnailDataUrl}" style="width:100%;height:92px;object-fit:cover;border-radius:4px;background:#000;" />`
                          : `<div style="width:100%;height:92px;background:#000;border-radius:4px;display:flex;align-items:center;justify-content:center;">🖥️</div>`
                      }
                      <div style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;">${escapeHtml(s.name)}</div>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
            `
            : `
              <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
                Escolha a qualidade da transmissão. Na janela seguinte, selecione a <strong>Tela Inteira</strong>, <strong>Janela de Jogo/App</strong> ou <strong>Aba</strong> e marque <em>"Compartilhar áudio do sistema/aba"</em>.
              </p>
            `
        }

        <div class="form-group">
          <label class="form-label">Resolução do Vídeo</label>
          <div class="choice-grid" id="golive-res-grid">
            <div class="choice-pill" data-res="720">720p HD</div>
            <div class="choice-pill selected" data-res="1080">1080p Full HD</div>
            <div class="choice-pill" data-res="1440">1440p QHD</div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Taxa de Quadros (Frame Rate)</label>
          <div class="choice-grid" id="golive-fps-grid">
            <div class="choice-pill" data-fps="15">15 FPS</div>
            <div class="choice-pill" data-fps="30">30 FPS</div>
            <div class="choice-pill selected" data-fps="60">60 FPS (Nitro)</div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Perfil de Otimização</label>
          <div class="choice-grid" id="golive-hint-grid">
            <div class="choice-pill selected" data-hint="motion">🎮 Jogos / Vídeo Fluido</div>
            <div class="choice-pill" data-hint="detail">💻 Código / Texto Nítido</div>
          </div>
        </div>

        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-top:12px;">
          <input type="checkbox" id="golive-audio-chk" checked style="width:18px;height:18px;" />
          <span><strong>Capturar Áudio do Sistema / Jogo</strong> (<code>soundshare_loopback</code>)</span>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancelar</button>
        <button class="btn-success" id="golive-start-btn">🔴 Transmitir ao Vivo (Go Live)</button>
      </div>
    `,
      hasNativeSources
    );

    modalRoot.querySelectorAll('#native-sources-grid .choice-pill').forEach(el => {
      el.onclick = () => {
        modalRoot.querySelectorAll('#native-sources-grid .choice-pill').forEach(p => p.classList.remove('selected'));
        el.classList.add('selected');
        selectedSourceId = el.getAttribute('data-source-id');
      };
    });

    modalRoot.querySelectorAll('#golive-res-grid .choice-pill').forEach(el => {
      el.onclick = () => {
        modalRoot.querySelectorAll('#golive-res-grid .choice-pill').forEach(p => p.classList.remove('selected'));
        el.classList.add('selected');
        selectedRes = Number(el.getAttribute('data-res'));
      };
    });

    modalRoot.querySelectorAll('#golive-fps-grid .choice-pill').forEach(el => {
      el.onclick = () => {
        modalRoot.querySelectorAll('#golive-fps-grid .choice-pill').forEach(p => p.classList.remove('selected'));
        el.classList.add('selected');
        selectedFps = Number(el.getAttribute('data-fps'));
      };
    });

    modalRoot.querySelectorAll('#golive-hint-grid .choice-pill').forEach(el => {
      el.onclick = () => {
        modalRoot.querySelectorAll('#golive-hint-grid .choice-pill').forEach(p => p.classList.remove('selected'));
        el.classList.add('selected');
        selectedHint = el.getAttribute('data-hint');
      };
    });

    document.getElementById('golive-start-btn').onclick = async () => {
      includeAudio = document.getElementById('golive-audio-chk').checked;
      if (hasNativeSources && window.DiscordNative?.desktopCapturer?.selectSource) {
        await window.DiscordNative.desktopCapturer.selectSource(selectedSourceId, includeAudio);
      }
      closeModal();
      const ok = await voiceEngine.setDesktopSourceWithOptions({
        resolution: selectedRes,
        fps: selectedFps,
        contentHint: selectedHint,
        includeAudio
      });
      if (ok) {
        state.stageCollapsedInText = false;
        state.stageLayout = 'spotlight';
        state.focusedTileKey = `${state.me.id}:screen`;
        renderAll();
      }
    };
  }

  // Multi-Network / Invite Friends & .EXE Room Connection Modal
  async function openNetworkModal() {
    try {
      state.network = await api('/api/network');
    } catch (_e) {}

    const net = state.network || {};
    const tunnel = net.tunnel || {};
    const installers = net.installers || [];
    const srv = getActiveServer() || state.servers[0];
    const inviteCode = srv?.inviteCode || 'DISCORD';
    const publicInviteLink = tunnel.url ? `${tunnel.url}/?invite=${inviteCode}` : '';
    const roomCode = tunnel.roomCode || (tunnel.url ? tunnel.url.replace(/^https?:\/\//, '').replace(/\.loca\.lt.*$/, '') : '');

    showModal(
      `
      <div class="modal-header">
        <div class="modal-title">🌐 Conectar Amigos em Redes Diferentes & App .EXE</div>
        <button class="icon-btn" data-close-modal>✖</button>
      </div>
      <div class="modal-body">
        ${
          installers.length > 0
            ? `
              <div style="background:rgba(88,101,242,0.16);border:1px solid rgba(88,101,242,0.5);padding:14px;border-radius:8px;margin-bottom:16px;">
                <div style="font-weight:700;color:#99a4ff;margin-bottom:6px;">
                  💿 Instalador para Windows (.EXE) — Envie para seus amigos instalarem no PC!
                </div>
                <p style="font-size:12px;color:var(--text-normal);margin-bottom:10px;">
                  Os arquivos <code>.exe</code> também estão salvos na pasta <strong><code>dist/</code></strong> do seu projeto para enviar pelo WhatsApp / Google Drive, ou seus amigos podem baixar direto clicando abaixo:
                </p>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  ${installers
                    .map(
                      inst => `
                    <a href="${inst.url}" download class="btn-primary" style="width:auto;text-decoration:none;display:inline-flex;align-items:center;gap:6px;padding:8px 14px;font-size:13px;">
                      📥 Baixar ${escapeHtml(inst.name)} (${escapeHtml(inst.sizeMb)} MB)
                    </a>
                  `
                    )
                    .join('')}
                </div>
              </div>
            `
            : ''
        }

        <div style="background:rgba(35,165,90,0.12);border:1px solid rgba(35,165,90,0.4);padding:14px;border-radius:8px;margin-bottom:16px;">
          <div style="font-weight:700;color:#57f287;margin-bottom:6px;">
            🚀 Seu Código da Sala & Link Público (Para amigos em outras redes)
          </div>
          <p style="font-size:13px;color:var(--text-normal);margin-bottom:10px;">
            Quando seus amigos abrirem o <strong>Discord REA (.exe)</strong> no computador deles, basta eles digitarem este <strong>Código da Sala</strong> (não pede senha no app <code>.exe</code>!):
          </p>
          ${
            tunnel.active && tunnel.url
              ? `
                <div style="display:grid;grid-template-columns:1fr 1.6fr;gap:8px;margin-bottom:8px;">
                  <div class="code-banner">
                    <div>
                      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">Código da Sala (.EXE)</div>
                      <strong style="color:#57f287;font-size:15px;">${escapeHtml(roomCode)}</strong>
                    </div>
                    <button class="btn-success" id="copy-room-code-btn" style="padding:5px 10px;font-size:12px;">Copiar Código</button>
                  </div>
                  <div class="code-banner">
                    <div style="overflow:hidden;">
                      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">Link Completo (Navegador / .EXE)</div>
                      <span id="public-tunnel-url" style="color:#57f287;font-weight:700;font-size:12px;">${escapeHtml(publicInviteLink)}</span>
                    </div>
                    <button class="btn-success" id="copy-tunnel-btn" style="padding:5px 10px;font-size:12px;">Copiar Link</button>
                  </div>
                </div>
              `
              : `
                <div style="font-size:13px;color:var(--yellow-300);margin-bottom:8px;">
                  ${tunnel.starting ? '⏳ Iniciando túnel público...' : 'Túnel público ainda não iniciado.'}
                </div>
              `
          }
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center;">
            <input id="custom-room-sub" class="form-input" placeholder="Nome personalizado (ex: sala-bernardo)" style="width:230px;padding:7px 10px;font-size:12px;" />
            <button class="btn-primary" id="refresh-tunnel-btn" style="width:auto;padding:7px 14px;font-size:13px;">
              🔄 ${tunnel.active ? 'Trocar / Renovar Sala' : 'Gerar Sala Agora'}
            </button>
            <button class="btn-secondary" id="open-second-tab-btn" style="padding:7px 14px;font-size:13px;">
              🧪 Abrir 2ª Janela de Teste
            </button>
          </div>
        </div>

        <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);padding:14px;border-radius:8px;margin-bottom:16px;">
          <div style="font-weight:700;color:var(--text-header);margin-bottom:6px;">
            🔗 Entrar na Sala / Servidor de Outro Amigo
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
            Se o seu amigo estiver hospedando a sala no PC dele, digite o <strong>Código da Sala</strong> ou link que ele te mandou:
          </p>
          <div style="display:flex;gap:8px;">
            <input id="modal-remote-host-input" class="form-input" placeholder="Ex: rich-hats-hope ou https://..." style="font-size:13px;padding:8px 10px;" />
            <button class="btn-success" id="modal-connect-remote-btn" style="white-space:nowrap;">Conectar à Sala do Amigo</button>
            ${
              window.DiscordNative?.remoteServer
                ? `<button class="btn-secondary" id="modal-connect-local-btn" style="white-space:nowrap;">🏠 Meu Servidor Local</button>`
                : ''
            }
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">🖧 Links na Mesma Rede Wi-Fi / LAN</label>
          ${
            (net.lanIps || []).length > 0
              ? net.lanIps
                  .map(
                    ip => `
                  <div class="code-banner" style="margin-bottom:6px;">
                    <span>${escapeHtml(ip.url)}/?invite=${escapeHtml(inviteCode)} <small style="color:var(--text-muted);">(${escapeHtml(ip.interface)})</small></span>
                    <button class="btn-secondary" data-copy-text="${escapeHtml(ip.url)}/?invite=${escapeHtml(inviteCode)}" style="padding:4px 8px;font-size:12px;">Copiar</button>
                  </div>
                `
                  )
                  .join('')
              : `<div class="code-banner">${escapeHtml(window.location.origin)}/?invite=${escapeHtml(inviteCode)}</div>`
          }
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" style="width:auto;" data-close-modal>Concluído</button>
      </div>
    `,
      true
    );

    document.getElementById('copy-room-code-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(roomCode);
      showToast(`Código da sala "${roomCode}" copiado! Envie para seus amigos colarem no app .EXE.`, 'success');
    });

    document.getElementById('copy-tunnel-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(publicInviteLink);
      showToast('Link público copiado! Envie para seus amigos.', 'success');
    });

    modalRoot.querySelectorAll('[data-copy-text]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.getAttribute('data-copy-text'));
        showToast('Link copiado!', 'success');
      });
    });

    document.getElementById('refresh-tunnel-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('refresh-tunnel-btn');
      const customSub = document.getElementById('custom-room-sub')?.value.trim() || '';
      btn.textContent = '⏳ Gerando...';
      btn.disabled = true;
      state.network = await api('/api/network/tunnel', {
        method: 'POST',
        body: { provider: 'auto', subdomain: customSub }
      });
      renderTopHeader();
      openNetworkModal();
    });

    document.getElementById('open-second-tab-btn')?.addEventListener('click', () => {
      window.open(`${window.location.origin}/?newSession=1&invite=${encodeURIComponent(inviteCode)}`, '_blank');
    });

    document.getElementById('modal-connect-remote-btn')?.addEventListener('click', async () => {
      const val = document.getElementById('modal-remote-host-input')?.value.trim();
      if (!val) return;
      await connectToFriendServer(val);
    });

    document.getElementById('modal-connect-local-btn')?.addEventListener('click', async () => {
      if (window.DiscordNative?.remoteServer) {
        await window.DiscordNative.remoteServer.connectToLocal();
      }
    });
  }

  async function connectToFriendServer(rawCodeOrUrl) {
    if (window.DiscordNative?.remoteServer) {
      showToast('Conectando à sala do amigo...', 'info');
      await window.DiscordNative.remoteServer.connectToHost(rawCodeOrUrl);
      return;
    }
    let url = String(rawCodeOrUrl || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url.toLowerCase().replace(/[^a-z0-9-]/g, '')}.loca.lt`;
    }
    window.location.href = url;
  }

  // REA Reverse Engineering Inspector Modal
  async function openReaInspectorModal() {
    let rea = null;
    try {
      rea = await api('/api/rea-evidence');
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }

    const artifacts = Object.entries(rea.artifacts || {});
    const voiceContract = rea.voice_engine_contract || {};

    showModal(
      `
      <div class="modal-header">
        <div class="modal-title">🔬 REA Inspector — Engenharia Reversa do Discord (${escapeHtml(rea.discord_version || '1.0.9262')})</div>
        <button class="icon-btn" data-close-modal>✖</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
          Evidências imutáveis geradas pelo repositório <strong><a href="https://github.com/morluto/rea" target="_blank" style="color:var(--text-link);">morluto/rea</a></strong> (<code>rea-agents</code>) a partir da instalação local do Discord Desktop.
        </p>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:12px;margin-bottom:18px;">
          ${artifacts
            .map(
              ([key, a]) => `
            <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);padding:12px;border-radius:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <strong style="color:var(--text-header);font-size:15px;">📦 ${escapeHtml(key)}</strong>
                <span class="bot-tag" style="background:var(--green-360);">${escapeHtml(a.status)}</span>
              </div>
              <div style="font-size:11px;font-family:monospace;color:#99a4ff;word-break:break-all;margin-bottom:4px;">
                <strong>Evidence ID:</strong> ${escapeHtml(a.evidence_id)}
              </div>
              <div style="font-size:11px;font-family:monospace;color:var(--text-muted);word-break:break-all;margin-bottom:8px;">
                <strong>SHA-256:</strong> ${escapeHtml(a.root_artifact_sha256)}
              </div>
              <div style="font-size:12px;color:var(--text-normal);">
                Nós no Grafo: <strong>${a.total_nodes ?? 0}</strong> • Arestas: <strong>${a.total_edges ?? 0}</strong> • Módulos: <strong>${a.statistics?.modules ?? 'Nativo'}</strong>
              </div>
            </div>
          `
            )
            .join('')}
        </div>

        <div class="form-group">
          <label class="form-label">🎧 Contrato VoiceEngine Extraído (${escapeHtml(voiceContract.source_module || '')})</label>
          <div style="background:var(--bg-tertiary);padding:10px;border-radius:6px;font-family:monospace;font-size:12px;max-height:130px;overflow-y:auto;">
            ${(voiceContract.connection_methods || []).map(m => `<span style="display:inline-block;background:var(--bg-secondary);padding:2px 6px;border-radius:4px;margin:2px;">${escapeHtml(m)}()</span>`).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">🚀 Recursos Declarados pelo Discord Voice (Features)</label>
          <div style="background:var(--bg-tertiary);padding:10px;border-radius:6px;font-family:monospace;font-size:12px;max-height:110px;overflow-y:auto;">
            ${(voiceContract.declared_features || []).map(f => `<span style="display:inline-block;background:rgba(88,101,242,0.2);color:#dee0fc;padding:2px 6px;border-radius:4px;margin:2px;">${escapeHtml(f)}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" style="width:auto;" data-close-modal>Fechar Inspector</button>
      </div>
    `,
      true
    );
  }

  // Soundboard Modal
  function openSoundboardModal() {
    const sounds = [
      { id: 'airhorn', emoji: '📯', label: 'Airhorn Clássico' },
      { id: 'rimshot', emoji: '🥁', label: 'Ba Dum Tss' },
      { id: 'victory', emoji: '🎉', label: 'GG / Vitória' },
      { id: 'quack', emoji: '🦆', label: 'Quack' },
      { id: 'bell', emoji: '🔔', label: 'Sino Cristalino' },
      { id: 'alert', emoji: '🚨', label: 'Alerta Geral' }
    ];

    showModal(`
      <div class="modal-header">
        <div class="modal-title">🔊 Soundboard (Efeitos Sonoros para o Canal)</div>
        <button class="icon-btn" data-close-modal>✖</button>
      </div>
      <div class="modal-body">
        <div class="choice-grid">
          ${sounds
            .map(
              s => `
            <div class="choice-pill" data-sb-id="${s.id}" data-sb-label="${s.label}" data-sb-emoji="${s.emoji}">
              <div style="font-size:24px;margin-bottom:4px;">${s.emoji}</div>
              <div>${escapeHtml(s.label)}</div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Fechar</button>
      </div>
    `);

    modalRoot.querySelectorAll('[data-sb-id]').forEach(el => {
      el.addEventListener('click', () => {
        const soundId = el.getAttribute('data-sb-id');
        const label = el.getAttribute('data-sb-label');
        const emoji = el.getAttribute('data-sb-emoji');
        if (voiceEngine?.channelId) {
          socket.emit('voice:soundboard', {
            channelId: voiceEngine.channelId,
            soundId,
            label,
            emoji
          });
        } else {
          audioFX.playSoundboardEffect(soundId);
        }
      });
    });
  }

  // Per-User Volume Boost Modal (0% - 200%)
  function openUserVolumeModal(userId) {
    const u = getUser(userId);
    const currentVol = voiceEngine?.getLocalVolume(userId) ?? 100;

    showModal(`
      <div class="modal-header">
        <div class="modal-title">🔊 Volume de ${escapeHtml(u.displayName)}</div>
        <button class="icon-btn" data-close-modal>✖</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Volume do Usuário (<span id="vol-label-val">${currentVol}%</span> — Suporta Boost até 200%)</label>
          <input id="user-vol-slider" type="range" min="0" max="200" value="${currentVol}" style="width:100%;" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="reset-vol-btn">100% Padrão</button>
        <button class="btn-primary" style="width:auto;" data-close-modal>Pronto</button>
      </div>
    `);

    const slider = document.getElementById('user-vol-slider');
    const lbl = document.getElementById('vol-label-val');
    slider.oninput = () => {
      lbl.textContent = `${slider.value}%`;
      voiceEngine?.setLocalVolume(userId, Number(slider.value));
      renderStage();
    };
    document.getElementById('reset-vol-btn').onclick = () => {
      slider.value = 100;
      lbl.textContent = '100%';
      voiceEngine?.setLocalVolume(userId, 100);
      renderStage();
    };
  }

  // DAVE / MLS Pairwise Fingerprint Modal
  function openMlsFingerprintModal(peerId, info) {
    const u = getUser(peerId);
    showModal(`
      <div class="modal-header">
        <div class="modal-title">🔐 Verificação de Privacidade de Voz (${escapeHtml(info?.protocol || 'DAVE/MLS')})</div>
        <button class="icon-btn" data-close-modal>✖</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
          Código de verificação par-a-par (<code>getMLSPairwiseFingerprint</code>) entre você e <strong>${escapeHtml(u.displayName)}</strong>:
        </p>
        <div class="code-banner" style="font-size:18px;font-weight:800;color:#57f287;justify-content:center;letter-spacing:0.08em;">
          ${escapeHtml(info?.fingerprint || '---')}
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:10px;word-break:break-all;font-family:monospace;">
          SHA-256: ${escapeHtml(info?.sha256 || '')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" style="width:auto;" data-close-modal>Verificado</button>
      </div>
    `);
  }

  // Create Server Modal
  function openCreateServerModal() {
    showModal(`
      <div class="modal-header">
        <div class="modal-title">Criar um Servidor</div>
        <button class="icon-btn" data-close-modal>✖</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Nome do Servidor</label>
          <input id="new-srv-name" class="form-input" type="text" placeholder="Servidor do ${escapeHtml(state.me?.displayName)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Ícone / Emoji (opcional)</label>
          <input id="new-srv-icon" class="form-input" type="text" placeholder="🎮" maxlength="4" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancelar</button>
        <button class="btn-primary" style="width:auto;" id="confirm-create-srv">Criar Servidor</button>
      </div>
    `);

    document.getElementById('confirm-create-srv').onclick = async () => {
      const name = document.getElementById('new-srv-name').value.trim();
      const icon = document.getElementById('new-srv-icon').value.trim();
      if (!name) return;
      try {
        const res = await api('/api/servers', { method: 'POST', body: { name, icon } });
        closeModal();
        state.mode = 'server';
        state.activeServerId = res.server.id;
        state.activeChannelId = res.server.channels[0]?.id;
        renderAll();
        if (state.activeChannelId) await loadChannelMessages(state.activeChannelId);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // Join Server via Invite Code Modal
  function openJoinServerModal() {
    showModal(`
      <div class="modal-header">
        <div class="modal-title">Entrar em um Servidor</div>
        <button class="icon-btn" data-close-modal>✖</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Código ou Link de Convite</label>
          <input id="join-invite-input" class="form-input" type="text" placeholder="Ex: DISCORD" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancelar</button>
        <button class="btn-primary" style="width:auto;" id="confirm-join-srv">Entrar no Servidor</button>
      </div>
    `);

    document.getElementById('confirm-join-srv').onclick = async () => {
      const code = document.getElementById('join-invite-input').value.trim();
      if (!code) return;
      try {
        const res = await api('/api/invites/join', { method: 'POST', body: { inviteCode: code } });
        closeModal();
        state.mode = 'server';
        state.activeServerId = res.server.id;
        state.activeChannelId = res.server.channels[0]?.id;
        renderAll();
        if (state.activeChannelId) await loadChannelMessages(state.activeChannelId);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // Create Channel Modal
  function openCreateChannelModal(srv, defaultCatId) {
    let chanType = 'text';
    showModal(`
      <div class="modal-header">
        <div class="modal-title">Criar Canal em ${escapeHtml(srv.name)}</div>
        <button class="icon-btn" data-close-modal>✖</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Tipo de Canal</label>
          <div class="choice-grid" id="chan-type-grid">
            <div class="choice-pill selected" data-ctype="text"># Canal de Texto</div>
            <div class="choice-pill" data-ctype="voice">🔊 Canal de Voz / Tela</div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Nome do Canal</label>
          <input id="new-chan-name" class="form-input" type="text" placeholder="novo-canal" />
        </div>
        <div class="form-group">
          <label class="form-label">Tópico (Opcional)</label>
          <input id="new-chan-topic" class="form-input" type="text" placeholder="Sobre o que é este canal?" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancelar</button>
        <button class="btn-primary" style="width:auto;" id="confirm-create-chan">Criar Canal</button>
      </div>
    `);

    modalRoot.querySelectorAll('#chan-type-grid .choice-pill').forEach(el => {
      el.onclick = () => {
        modalRoot.querySelectorAll('#chan-type-grid .choice-pill').forEach(p => p.classList.remove('selected'));
        el.classList.add('selected');
        chanType = el.getAttribute('data-ctype');
      };
    });

    document.getElementById('confirm-create-chan').onclick = async () => {
      const name = document.getElementById('new-chan-name').value.trim();
      const topic = document.getElementById('new-chan-topic').value.trim();
      if (!name) return;
      try {
        const res = await api(`/api/servers/${srv.id}/channels`, {
          method: 'POST',
          body: { name, type: chanType, categoryId: defaultCatId, topic }
        });
        closeModal();
        state.activeChannelId = res.channel.id;
        renderAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // Invite Friends to Server Modal
  function openInviteFriendsModal(srv) {
    const tunnelUrl = state.network?.tunnel?.url || window.location.origin;
    const fullLink = `${tunnelUrl}/?invite=${srv.inviteCode}`;

    showModal(`
      <div class="modal-header">
        <div class="modal-title">Convidar amigos para ${escapeHtml(srv.name)}</div>
        <button class="icon-btn" data-close-modal>✖</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Link de Convite Direto (Funciona em Redes Diferentes)</label>
          <div class="code-banner">
            <span>${escapeHtml(fullLink)}</span>
            <button class="btn-success" id="copy-srv-inv-link" style="padding:5px 10px;font-size:12px;">Copiar</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Código de Convite</label>
          <div class="code-banner">
            <strong style="font-size:16px;">${escapeHtml(srv.inviteCode)}</strong>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="open-net-from-inv">🌐 Opções de Túnel Multi-Rede</button>
        <button class="btn-primary" style="width:auto;" data-close-modal>Fechar</button>
      </div>
    `);

    document.getElementById('copy-srv-inv-link').onclick = () => {
      navigator.clipboard.writeText(fullLink);
      showToast('Link de convite copiado!', 'success');
    };
    document.getElementById('open-net-from-inv').onclick = openNetworkModal;
  }

  function openServerMenuModal() {
    const srv = getActiveServer();
    if (!srv) return;
    openInviteFriendsModal(srv);
  }

  // Pinned Messages Modal
  function openPinnedMessagesModal() {
    const msgs = (state.messagesByChannel.get(state.activeChannelId) || []).filter(m => m.pinned);
    showModal(`
      <div class="modal-header">
        <div class="modal-title">📌 Mensagens Fixadas (${msgs.length})</div>
        <button class="icon-btn" data-close-modal>✖</button>
      </div>
      <div class="modal-body">
        ${
          msgs.length === 0
            ? `<div style="color:var(--text-muted);">Nenhuma mensagem fixada neste canal ainda.</div>`
            : msgs
                .map(m => {
                  const u = getUser(m.authorId);
                  return `
                    <div style="background:var(--bg-secondary);padding:12px;border-radius:6px;margin-bottom:10px;border:1px solid var(--border-subtle);">
                      <div style="font-weight:700;color:var(--text-header);margin-bottom:4px;">${escapeHtml(u.displayName)} <small style="color:var(--text-muted);">${formatTime(m.createdAt)}</small></div>
                      <div style="font-size:14px;">${formatDiscordMarkdown(m.content)}</div>
                    </div>
                  `;
                })
                .join('')
        }
      </div>
      <div class="modal-footer">
        <button class="btn-primary" style="width:auto;" data-close-modal>Fechar</button>
      </div>
    `);
  }

  // User Profile Popover Modal
  function openUserProfileModal(userId) {
    const u = getUser(userId);
    const isMe = u.id === state.me?.id;
    const vol = voiceEngine?.getLocalVolume(userId) ?? 100;

    showModal(`
      <div style="height:90px;background:${u.bannerColor || u.avatarColor};position:relative;">
        <button class="icon-btn" data-close-modal style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.5);color:#fff;">✖</button>
      </div>
      <div class="modal-body" style="padding-top:0;">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:-36px;margin-bottom:14px;">
          <div style="width:76px;height:76px;border-radius:50%;background:${u.avatarColor};border:6px solid var(--bg-primary);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#fff;">
            ${escapeHtml(getInitials(u.displayName))}
          </div>
          ${
            !isMe
              ? `
                <div style="display:flex;gap:8px;">
                  <button class="btn-primary" style="width:auto;padding:7px 12px;" id="prof-dm-btn">💬 Enviar Mensagem</button>
                  <button class="btn-success" style="padding:7px 12px;" id="prof-add-btn">➕ Amigo</button>
                </div>
              `
              : `<button class="btn-secondary" id="prof-edit-me">✏️ Editar Perfil</button>`
          }
        </div>
        <div style="font-size:20px;font-weight:800;color:var(--text-header);">${escapeHtml(u.displayName)}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">@${escapeHtml(u.username)}#${escapeHtml(u.discriminator || '0001')}</div>

        ${
          u.customStatus
            ? `<div style="background:var(--bg-secondary);padding:8px 12px;border-radius:6px;font-size:13px;margin-bottom:12px;">💭 ${escapeHtml(u.customStatus)}</div>`
            : ''
        }

        <div class="form-label">SOBRE MIM</div>
        <div style="background:var(--bg-secondary);padding:10px 12px;border-radius:6px;font-size:13px;margin-bottom:14px;">
          ${escapeHtml(u.bio || 'Membro da comunidade Discord REA.')}
        </div>

        ${
          !isMe
            ? `
              <div class="form-label">VOLUME DE VOZ INDIVIDUAL (${vol}%)</div>
              <input id="prof-vol-slider" type="range" min="0" max="200" value="${vol}" style="width:100%;" />
            `
            : ''
        }
      </div>
    `);

    document.getElementById('prof-edit-me')?.addEventListener('click', openUserSettingsModal);
    document.getElementById('prof-dm-btn')?.addEventListener('click', async () => {
      closeModal();
      const res = await api('/api/dms', { method: 'POST', body: { targetUserId: u.id } });
      if (res.dm) {
        if (!state.dms.some(d => d.id === res.dm.id)) state.dms.unshift(res.dm);
        state.mode = 'home';
        state.activeChannelId = res.dm.id;
        renderAll();
        await loadChannelMessages(res.dm.id);
      }
    });
    document.getElementById('prof-add-btn')?.addEventListener('click', async () => {
      try {
        await api('/api/friends/request', { method: 'POST', body: { targetUserId: u.id } });
        showToast('Pedido de amizade enviado!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    document.getElementById('prof-vol-slider')?.addEventListener('input', (e) => {
      voiceEngine?.setLocalVolume(u.id, Number(e.target.value));
    });
  }

  // Full User Settings Modal
  function openUserSettingsModal() {
    const me = state.me;
    if (!me) return;

    showModal(
      `
      <div class="modal-header">
        <div class="modal-title">⚙️ Configurações de Usuário, Aparência & Voz</div>
        <button class="icon-btn" data-close-modal>✖</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group">
            <label class="form-label">Nome de Exibição</label>
            <input id="set-displayname" class="form-input" value="${escapeHtml(me.displayName)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Status de Presença</label>
            <select id="set-status" class="form-input">
              <option value="online" ${me.rawStatus === 'online' ? 'selected' : ''}>🟢 Online</option>
              <option value="idle" ${me.rawStatus === 'idle' ? 'selected' : ''}>🌙 Ausente</option>
              <option value="dnd" ${me.rawStatus === 'dnd' ? 'selected' : ''}>⛔ Não Perturbe</option>
              <option value="invisible" ${me.rawStatus === 'invisible' ? 'selected' : ''}>⚪ Invisível</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Status Personalizado</label>
          <input id="set-customstatus" class="form-input" placeholder="O que você está jogando ou fazendo?" value="${escapeHtml(me.customStatus || '')}" />
        </div>

        <div class="form-group">
          <label class="form-label">Sobre Mim (Bio)</label>
          <input id="set-bio" class="form-input" value="${escapeHtml(me.bio || '')}" />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group">
            <label class="form-label">Cor do Avatar</label>
            <input id="set-color" type="color" class="form-input" style="height:42px;padding:4px;" value="${escapeHtml(me.avatarColor || '#5865F2')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Tema do Discord</label>
            <select id="set-theme" class="form-input">
              <option value="dark" ${state.theme === 'dark' ? 'selected' : ''}>Escuro (Ash / Padrão)</option>
              <option value="midnight" ${state.theme === 'midnight' ? 'selected' : ''}>Meia-Noite (OLED)</option>
              <option value="light" ${state.theme === 'light' ? 'selected' : ''}>Claro</option>
            </select>
          </div>
        </div>

        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-top:6px;">
          <input type="checkbox" id="set-compact" ${state.compactMode ? 'checked' : ''} />
          <span>Modo de Mensagens Compacto</span>
        </label>
      </div>
      <div class="modal-footer" style="justify-content:space-between;">
        <button class="btn-danger" id="logout-btn">Sair da Conta</button>
        <div style="display:flex;gap:10px;">
          <button class="btn-secondary" data-close-modal>Cancelar</button>
          <button class="btn-primary" style="width:auto;" id="save-settings-btn">Salvar Alterações</button>
        </div>
      </div>
    `,
      true
    );

    document.getElementById('save-settings-btn').onclick = async () => {
      const displayName = document.getElementById('set-displayname').value.trim();
      const status = document.getElementById('set-status').value;
      const customStatus = document.getElementById('set-customstatus').value.trim();
      const bio = document.getElementById('set-bio').value.trim();
      const avatarColor = document.getElementById('set-color').value;
      const theme = document.getElementById('set-theme').value;
      const compact = document.getElementById('set-compact').checked;

      state.theme = theme;
      state.compactMode = compact;
      localStorage.setItem('discord_rea_theme', theme);
      localStorage.setItem('discord_rea_compact', compact ? '1' : '0');
      applyAppearance();

      try {
        const res = await api('/api/users/me', {
          method: 'PATCH',
          body: { displayName, status, customStatus, bio, avatarColor, bannerColor: avatarColor }
        });
        state.me = res.user;
        closeModal();
        showToast('Perfil e preferências atualizados!', 'success');
        renderAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    document.getElementById('logout-btn').onclick = () => {
      voiceEngine?.leaveChannel(true);
      socket?.disconnect();
      clearToken();
      state.token = null;
      closeModal();
      authOverlay.classList.remove('hidden');
      appShell.classList.add('hidden');
    };
  }

  // Global Keyboard Shortcuts (Discord keybinds: Ctrl+Shift+M mute, Ctrl+Shift+D deafen)
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      voiceEngine?.setSelfMute(!voiceEngine.selfMute);
    } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      voiceEngine?.setSelfDeafen(!voiceEngine.selfDeaf);
    }
  });

  if (window.DiscordNative?.onGlobalShortcut) {
    window.DiscordNative.onGlobalShortcut((action) => {
      if (action === 'toggle-mute') voiceEngine?.setSelfMute(!voiceEngine.selfMute);
      if (action === 'toggle-deaf') voiceEngine?.setSelfDeafen(!voiceEngine.selfDeaf);
    });
  }

  // Auth screen remote host connection & .EXE download banner
  document.getElementById('connect-remote-host-btn')?.addEventListener('click', () => {
    const val = document.getElementById('remote-host-input')?.value.trim();
    if (val) connectToFriendServer(val);
  });

  api('/api/downloads')
    .then((d) => {
      const list = d?.installers || [];
      const banner = document.getElementById('download-exe-banner');
      if (banner && list.length > 0 && !window.DiscordNative?.isDesktopApp) {
        banner.classList.remove('hidden');
        banner.innerHTML = list
          .map(
            inst =>
              `<a href="${inst.url}" download class="btn-primary" style="display:block;text-align:center;text-decoration:none;padding:8px;font-size:12px;margin-top:6px;background:#23a55a;">📥 Baixar App Desktop (${escapeHtml(inst.name)})</a>`
          )
          .join('');
      }
    })
    .catch(() => {});

  // Start App
  bootstrapApp();
})();

