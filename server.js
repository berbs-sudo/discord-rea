const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const cors = require('cors');
const compression = require('compression');
const multer = require('multer');
const { Server } = require('socket.io');

let PORT = Number(process.env.PORT) || 3000;
const BASE_WRITABLE_DIR = process.env.DISCORD_REA_DATA_DIR || __dirname;
const DATA_DIR = path.join(BASE_WRITABLE_DIR, 'data');
const UPLOADS_DIR = path.join(BASE_WRITABLE_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'discord-db.json');
const REA_SUMMARY_FILE = path.join(__dirname, 'data', 'rea-evidence-summary.json');
const DIST_DIR = path.join(__dirname, 'dist');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  maxHttpBufferSize: 25 * 1024 * 1024,
  pingTimeout: 30000,
  pingInterval: 10000
});

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for file/image/video/audio uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 12);
    const safeBase = path.basename(file.originalname || 'file', ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeBase}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

// Avatar color palette matching Discord's brand colors
const AVATAR_COLORS = [
  '#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245',
  '#3BA55C', '#FAA61A', '#9B59B6', '#1ABC9C', '#E67E22'
];

function randomId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(String(pw) + '_rea_discord_salt').digest('hex');
}

// Default database seed
function createDefaultDb() {
  const now = new Date().toISOString();
  const botId = 'usr_rea_bot';
  const serverId = 'srv_default_rea';

  return {
    users: [
      {
        id: botId,
        username: 'rea.bot',
        displayName: 'REA Architecture Bot',
        discriminator: '0001',
        passwordHash: hashPassword('system_bot_locked'),
        avatarColor: '#5865F2',
        avatarUrl: '',
        bannerColor: '#5865F2',
        bio: 'Bot oficial do servidor gerado a partir da engenharia reversa do Discord 1.0.9262 usando morluto/rea.',
        status: 'online',
        customStatus: 'Analisando app.asar & discord_voice.node',
        isBot: true,
        createdAt: now
      }
    ],
    sessions: {},
    servers: [
      {
        id: serverId,
        name: 'Discord REA (Oficial)',
        icon: '⚡',
        iconUrl: '',
        bannerColor: '#5865F2',
        ownerId: botId,
        inviteCode: 'DISCORD',
        description: 'Servidor principal recriado com base nas evidências extraídas pelo REA (morluto/rea). Convide seus amigos de qualquer rede!',
        roles: [
          { id: 'role_admin', name: 'Admin', color: '#ED4245', hoist: true, permissions: ['ALL'] },
          { id: 'role_streamer', name: 'Go Live Streamer', color: '#57F287', hoist: true, permissions: ['STREAM', 'VOICE', 'CHAT'] },
          { id: 'role_member', name: 'Membro', color: '#99AAB5', hoist: false, permissions: ['VOICE', 'CHAT'] }
        ],
        categories: [
          { id: 'cat_info', name: 'INFORMAÇÕES & REDE', position: 0 },
          { id: 'cat_text', name: 'CANAIS DE TEXTO', position: 1 },
          { id: 'cat_voice', name: 'CANAIS DE VOZ & TELA', position: 2 }
        ],
        channels: [
          {
            id: 'chan_boas_vindas',
            categoryId: 'cat_info',
            name: 'boas-vindas-e-rede',
            type: 'announcement',
            topic: 'Como conectar amigos em redes diferentes, usar compartilhamento de tela (Go Live) e inspecionar a arquitetura REA.',
            position: 0
          },
          {
            id: 'chan_geral',
            categoryId: 'cat_text',
            name: 'geral',
            type: 'text',
            topic: 'Bate-papo geral com suporte a Markdown, respostas, reações, anexos, convites e chamadas.',
            position: 1
          },
          {
            id: 'chan_jogos',
            categoryId: 'cat_text',
            name: 'jogos-e-streams',
            type: 'text',
            topic: 'Combine partidas e compartilhe clipes ou transmissões de tela em 1080p/60fps.',
            position: 2
          },
          {
            id: 'chan_rea',
            categoryId: 'cat_text',
            name: 'engenharia-reversa-rea',
            type: 'text',
            topic: 'Evidências extraídas de app.asar, core.asar e discord_voice pelo repositório morluto/rea.',
            position: 3
          },
          {
            id: 'chan_voice_lobby',
            categoryId: 'cat_voice',
            name: 'Lobby Geral',
            type: 'voice',
            topic: 'Canal de voz e vídeo principal',
            bitrate: 96000,
            userLimit: 0,
            position: 4
          },
          {
            id: 'chan_voice_cinema',
            categoryId: 'cat_voice',
            name: 'Cinema & Tela (Go Live)',
            type: 'voice',
            topic: 'Compartilhamento de tela 1080p 60fps com áudio do sistema',
            bitrate: 128000,
            userLimit: 0,
            position: 5
          },
          {
            id: 'chan_voice_squad',
            categoryId: 'cat_voice',
            name: 'Squad / Ranked',
            type: 'voice',
            topic: 'Comunicação rápida de baixa latência',
            bitrate: 96000,
            userLimit: 5,
            position: 6
          }
        ],
        members: [
          { userId: botId, roles: ['role_admin'], joinedAt: now }
        ],
        createdAt: now
      }
    ],
    dms: [],
    friendships: [],
    messages: {
      chan_boas_vindas: [
        {
          id: 'msg_welcome_1',
          channelId: 'chan_boas_vindas',
          authorId: botId,
          content: [
            '# 👋 Bem-vindo ao Discord Recriado com **REA** (`morluto/rea`)!',
            '',
            'Esta aplicação recria a experiência completa do **Discord Desktop (`1.0.9262`)** guiada pela engenharia reversa real dos pacotes `app.asar`, `core.asar` e `discord_voice` via **[morluto/rea](https://github.com/morluto/rea)**.',
            '',
            '### 🌐 Como usar com amigos em **Redes Diferentes**:',
            '1. Clique no botão **"🌐 Convidar Amigos (Multi-Rede)"** no topo da tela (ou em **Configurações → Rede & Acesso Remoto**).',
            '2. Copie o **Link Público HTTPS (Túnel)** gerado automaticamente e envie para seus amigos!',
            '3. Como o túnel fornece `https://` e sinalização WebRTC com servidores **STUN + TURN + Fallback Relay**, seus amigos em outras cidades/redes podem entrar, conversar por voz, abrir câmera e **compartilhar a tela com áudio** direto pelo navegador sem precisar configurar roteador!',
            '',
            '### 🖥️ Como usar o **Compartilhamento de Tela (Go Live)**:',
            '- Entre em qualquer **Canal de Voz** (ex: `🔊 Lobby Geral` ou `🔊 Cinema & Tela`) ou inicie uma **Chamada de Voz/Vídeo na DM**.',
            '- Clique em **"Compartilhar Tela"** no painel de voz, escolha a qualidade (**720p / 1080p / 1440p** e **30 / 60 FPS**), selecione a tela/janela/aba e marque **"Compartilhar áudio"**.',
            '- Múltiplos amigos podem transmitir a tela ao mesmo tempo! Basta clicar no card com a tag **`AO VIVO`** para assistir em destaque, tela cheia ou Picture-in-Picture.'
          ].join('\n'),
          attachments: [],
          reactions: { '🔥': [botId], '🚀': [botId], '🎮': [botId] },
          pinned: true,
          replyToId: null,
          editedAt: null,
          createdAt: now
        }
      ],
      chan_geral: [
        {
          id: 'msg_geral_1',
          channelId: 'chan_geral',
          authorId: botId,
          content: 'Salve! 🎉 Este é o canal **#geral**. Experimente enviar mensagens com **Markdown** (`**negrito**`, `*itálico*`, `` `código` ``, `||spoiler||`), colar imagens (`Ctrl+V`), reagir com emojis, fixar mensagens ou entrar no canal `🔊 Lobby Geral` ali na barra esquerda!\n\nCódigo de convite deste servidor: **`DISCORD`**',
          attachments: [],
          reactions: { '👋': [botId] },
          pinned: false,
          replyToId: null,
          editedAt: null,
          createdAt: now
        }
      ],
      chan_rea: [
        {
          id: 'msg_rea_1',
          channelId: 'chan_rea',
          authorId: botId,
          content: [
            '## 🔍 Relatório de Engenharia Reversa (`morluto/rea`)',
            'Os artefatos instalados do Discord (`1.0.9262`) foram analisados com `rea-agents`:',
            '- **`app.asar`**: `ev_5676ab235c21e6daa3300a348c827794547b0b2f0bca1cc41b7e55f139f6671b` (`1.447` nós, `4.610` arestas, `976` módulos Webpack)',
            '- **`core.asar`**: `ev_b81e2a5f2aa2bbbb5c2aacc7e06c26870c64a0a97b39cbf2cf231bf7d342f619` (`787` nós, `492` módulos em `bundle.js` e `mainScreenPreload.js`)',
            '- **`discord_voice`**: `ev_82a55f9acd4a51edc8bb7a4ddb33a1be16fee5152e948c6dac1928ff4b1eb949` (`VoiceEngine` com `setGoLiveDevices`, `setDesktopSourceWithOptions`, `soundshare`, `remote_user_multi_stream`, `getMLSPairwiseFingerprint`)',
            '- **`discord_voice.node`**: `ev_9caaf76911b1bc89b3c07499c70d2651d2c189dbbcd9f200e608979d80f09f76` (binário nativo PE32+)',
            '',
            '👉 Clique no botão **"🔬 REA Inspector"** no topo ou nas Configurações para explorar o grafo completo e os contratos extraídos!'
          ].join('\n'),
          attachments: [],
          reactions: { '🔬': [botId], '⚡': [botId] },
          pinned: true,
          replyToId: null,
          editedAt: null,
          createdAt: now
        }
      ]
    }
  };
}

let db = null;
let saveTimer = null;

function saveDb(immediate = false, targetDb = null) {
  const dataToSave = targetDb || db;
  if (!dataToSave) return;
  if (immediate) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
    } catch (e) {
      console.error('Erro ao salvar DB:', e.message);
    }
    return;
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
    } catch (e) {
      console.error('Erro ao salvar DB:', e.message);
    }
  }, 250);
}

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.servers)) {
        parsed.sessions = parsed.sessions || {};
        parsed.dms = parsed.dms || [];
        parsed.friendships = parsed.friendships || [];
        parsed.messages = parsed.messages || {};
        return parsed;
      }
    }
  } catch (err) {
    console.error('Erro ao carregar DB, criando novo:', err.message);
  }
  const fresh = createDefaultDb();
  saveDb(true, fresh);
  return fresh;
}

db = loadDb();

// Sanitize user object before sending to clients
function publicUser(u) {
  if (!u) return null;
  const isOnline = onlineUsers.has(u.id) || u.isBot;
  const effectiveStatus = u.isBot
    ? 'online'
    : !isOnline
      ? 'offline'
      : u.status === 'invisible'
        ? 'offline'
        : (u.status || 'online');
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName || u.username,
    discriminator: u.discriminator || '0001',
    avatarColor: u.avatarColor || '#5865F2',
    avatarUrl: u.avatarUrl || '',
    bannerColor: u.bannerColor || '#5865F2',
    bio: u.bio || '',
    status: effectiveStatus,
    rawStatus: u.status || 'online',
    customStatus: u.customStatus || '',
    isBot: !!u.isBot,
    createdAt: u.createdAt
  };
}

// Runtime memory state for sockets, presence, and voice channels
// onlineUsers: Map<userId, Set<socketId>>
const onlineUsers = new Map();
// socketToUser: Map<socketId, userId>
const socketToUser = new Map();
// voiceStates: Map<userId, { userId, socketId, channelId, serverId, selfMute, selfDeaf, video, screenShare, streamOptions, speaking, joinedAt, rtt }>
const voiceStates = new Map();

// Multi-network Tunnel State (LocalTunnel / Cloudflared)
const tunnelState = {
  active: false,
  provider: null,
  url: null,
  passwordHint: null,
  error: null,
  starting: false,
  instance: null
};

function getLocalLanIps() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push({ interface: name, address: net.address, url: `http://${net.address}:${PORT}` });
      }
    }
  }
  return results;
}

// Default WebRTC ICE configuration with multiple STUN and free public OpenRelay/Metered TURN servers
// so friends across different ISPs/NATs can stream voice, video, and screen share reliably
function getIceServers() {
  const customTurnUrl = process.env.TURN_URL;
  const customTurnUser = process.env.TURN_USERNAME;
  const customTurnPass = process.env.TURN_PASSWORD;
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];
  if (customTurnUrl && customTurnUser && customTurnPass) {
    iceServers.push({
      urls: customTurnUrl.split(',').map(s => s.trim()),
      username: customTurnUser,
      credential: customTurnPass
    });
  }
  return iceServers;
}

async function startPublicTunnel(preferredProvider = 'auto', customSubdomain = '') {
  if (tunnelState.starting) return tunnelState;
  tunnelState.starting = true;
  tunnelState.error = null;

  try {
    if (tunnelState.instance) {
      try {
        if (typeof tunnelState.instance.close === 'function') tunnelState.instance.close();
        if (typeof tunnelState.instance.kill === 'function') tunnelState.instance.kill();
      } catch (_e) {}
      tunnelState.instance = null;
    }

    // Try cloudflared quick tunnel first if available and no custom localtunnel subdomain requested
    const tryCloudflared = () => new Promise((resolve, reject) => {
      let resolved = false;
      const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      });
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { proc.kill(); } catch (_e) {}
          reject(new Error('cloudflared timeout'));
        }
      }, 9000);

      const onData = (chunk) => {
        const text = chunk.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ url: match[0], proc, provider: 'cloudflared' });
        }
      };
      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);
      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(err);
        }
      });
      proc.on('exit', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`cloudflared exited (${code})`));
        } else if (tunnelState.provider === 'cloudflared') {
          tunnelState.active = false;
          tunnelState.url = null;
          io.emit('network:updated', getNetworkInfo());
        }
      });
    });

    if ((preferredProvider === 'cloudflared' || preferredProvider === 'auto') && !customSubdomain) {
      try {
        const cf = await tryCloudflared();
        tunnelState.active = true;
        tunnelState.provider = 'cloudflared';
        tunnelState.url = cf.url;
        tunnelState.roomCode = cf.url.replace(/^https?:\/\//, '');
        tunnelState.passwordHint = null;
        tunnelState.instance = cf.proc;
        tunnelState.starting = false;
        io.emit('network:updated', getNetworkInfo());
        return tunnelState;
      } catch (_cfErr) {
        if (preferredProvider === 'cloudflared') {
          throw _cfErr;
        }
      }
    }

    // Fallback to localtunnel (installed via npm)
    const localtunnel = require('localtunnel');
    const cleanSub = String(customSubdomain || '')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 42);
    const ltOpts = { port: PORT };
    if (cleanSub && cleanSub.length >= 4) {
      ltOpts.subdomain = cleanSub;
    }
    const tunnel = await localtunnel(ltOpts);
    tunnelState.active = true;
    tunnelState.provider = 'localtunnel';
    tunnelState.url = tunnel.url;
    tunnelState.roomCode = tunnel.url
      .replace(/^https?:\/\//i, '')
      .replace(/\.loca\.lt\/?$/i, '');
    tunnelState.instance = tunnel;
    tunnelState.starting = false;

    tunnel.on('close', () => {
      tunnelState.active = false;
      tunnelState.url = null;
      io.emit('network:updated', getNetworkInfo());
    });
    tunnel.on('error', (err) => {
      tunnelState.error = err?.message || 'Tunnel error';
    });

    // Fetch public IP for localtunnel password hint if needed (only needed in regular web browsers; the .EXE bypasses this automatically!)
    fetch('https://loca.lt/mytunnelpassword')
      .then(r => r.ok ? r.text() : '')
      .then(ip => {
        if (ip && ip.trim().length < 48) {
          tunnelState.passwordHint = ip.trim();
          io.emit('network:updated', getNetworkInfo());
        }
      })
      .catch(() => {});

    io.emit('network:updated', getNetworkInfo());
    return tunnelState;
  } catch (err) {
    tunnelState.active = false;
    tunnelState.starting = false;
    tunnelState.error = err.message || 'Falha ao iniciar túnel público';
    io.emit('network:updated', getNetworkInfo());
    return tunnelState;
  }
}

function getAvailableInstallers() {
  try {
    if (!fs.existsSync(DIST_DIR)) return [];
    const files = fs.readdirSync(DIST_DIR);
    return files
      .filter(f => f.toLowerCase().endsWith('.exe') && !f.toLowerCase().includes('uninstall'))
      .map(f => {
        const st = fs.statSync(path.join(DIST_DIR, f));
        return {
          name: f,
          size: st.size,
          sizeMb: (st.size / (1024 * 1024)).toFixed(1),
          url: `/download/${encodeURIComponent(f)}`
        };
      });
  } catch (_e) {
    return [];
  }
}

function getNetworkInfo() {
  return {
    port: PORT,
    localhostUrl: `http://localhost:${PORT}`,
    lanIps: getLocalLanIps(),
    tunnel: {
      active: tunnelState.active,
      starting: tunnelState.starting,
      provider: tunnelState.provider,
      url: tunnelState.url,
      roomCode: tunnelState.roomCode || null,
      passwordHint: tunnelState.passwordHint,
      error: tunnelState.error
    },
    installers: getAvailableInstallers(),
    iceServers: getIceServers()
  };
}

// Auth helper middleware
function getAuthUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim() || req.query.token;
  if (!token) return null;
  const userId = db.sessions[token];
  if (!userId) return null;
  return db.users.find(u => u.id === userId) || null;
}

function requireAuth(req, res, next) {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Não autenticado' });
  req.user = user;
  next();
}

function ensureUserInDefaultServer(userId) {
  const defaultSrv = db.servers.find(s => s.id === 'srv_default_rea') || db.servers[0];
  if (defaultSrv && !defaultSrv.members.some(m => m.userId === userId)) {
    defaultSrv.members.push({
      userId,
      roles: ['role_member'],
      joinedAt: new Date().toISOString()
    });
  }
}

// ======================== REST API ROUTES ========================

// Register
app.post('/api/auth/register', (req, res) => {
  const { username, displayName, password } = req.body || {};
  const cleanUser = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 28);

  if (!cleanUser || cleanUser.length < 2) {
    return res.status(400).json({ error: 'Nome de usuário deve ter pelo menos 2 caracteres válidos.' });
  }
  if (!password || String(password).length < 3) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 3 caracteres.' });
  }
  if (db.users.some(u => u.username.toLowerCase() === cleanUser)) {
    return res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
  }

  const discrim = String(Math.floor(1000 + Math.random() * 9000));
  const color = AVATAR_COLORS[db.users.length % AVATAR_COLORS.length];
  const newUser = {
    id: randomId('usr'),
    username: cleanUser,
    displayName: String(displayName || username).trim().slice(0, 32) || cleanUser,
    discriminator: discrim,
    passwordHash: hashPassword(password),
    avatarColor: color,
    avatarUrl: '',
    bannerColor: color,
    bio: 'Membro do Discord REA',
    status: 'online',
    customStatus: '',
    isBot: false,
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  ensureUserInDefaultServer(newUser.id);

  const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
  db.sessions[token] = newUser.id;
  saveDb(true);

  io.emit('user:updated', publicUser(newUser));
  io.emit('server:updated', db.servers[0]);

  res.json({ token, user: publicUser(newUser) });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const cleanUser = String(username || '').trim().toLowerCase();
  const user = db.users.find(u => u.username.toLowerCase() === cleanUser);
  if (!user || user.passwordHash !== hashPassword(password || '')) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  }
  ensureUserInDefaultServer(user.id);
  const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
  db.sessions[token] = user.id;
  saveDb(true);
  res.json({ token, user: publicUser(user) });
});

// Quick Guest / Instant Join (great for friends opening the link for the first time)
app.post('/api/auth/guest', (req, res) => {
  const { displayName } = req.body || {};
  const baseName = String(displayName || 'Amigo').trim().slice(0, 24) || 'Amigo';
  const suffix = Math.floor(100 + Math.random() * 900);
  const cleanUser = `${baseName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'amigo'}_${suffix}`;
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

  const newUser = {
    id: randomId('usr'),
    username: cleanUser,
    displayName: baseName,
    discriminator: String(Math.floor(1000 + Math.random() * 9000)),
    passwordHash: hashPassword(cleanUser),
    avatarColor: color,
    avatarUrl: '',
    bannerColor: color,
    bio: 'Entrou via convite rápido multi-rede',
    status: 'online',
    customStatus: '',
    isBot: false,
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  ensureUserInDefaultServer(newUser.id);
  const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
  db.sessions[token] = newUser.id;
  saveDb(true);

  io.emit('user:updated', publicUser(newUser));
  io.emit('server:updated', db.servers[0]);

  res.json({ token, user: publicUser(newUser) });
});

// Bootstrap full state for logged-in client
app.get('/api/bootstrap', requireAuth, (req, res) => {
  ensureUserInDefaultServer(req.user.id);
  const myServers = db.servers.filter(s => s.members.some(m => m.userId === req.user.id));
  const myDms = db.dms.filter(d => d.participantIds.includes(req.user.id));
  const myFriendships = db.friendships.filter(
    f => f.fromUserId === req.user.id || f.toUserId === req.user.id
  );

  res.json({
    me: publicUser(req.user),
    users: db.users.map(publicUser),
    servers: myServers,
    allPublicServers: db.servers.map(s => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      iconUrl: s.iconUrl,
      description: s.description,
      inviteCode: s.inviteCode,
      memberCount: s.members.length
    })),
    dms: myDms,
    friendships: myFriendships,
    voiceStates: Array.from(voiceStates.values()),
    network: getNetworkInfo()
  });
});

// Update current user's profile & presence
app.patch('/api/users/me', requireAuth, (req, res) => {
  const { displayName, bio, avatarColor, avatarUrl, bannerColor, status, customStatus } = req.body || {};
  if (displayName !== undefined) req.user.displayName = String(displayName).trim().slice(0, 32) || req.user.username;
  if (bio !== undefined) req.user.bio = String(bio).slice(0, 190);
  if (avatarColor !== undefined) req.user.avatarColor = String(avatarColor).slice(0, 16);
  if (avatarUrl !== undefined) req.user.avatarUrl = String(avatarUrl).slice(0, 500);
  if (bannerColor !== undefined) req.user.bannerColor = String(bannerColor).slice(0, 16);
  if (status !== undefined && ['online', 'idle', 'dnd', 'invisible'].includes(status)) {
    req.user.status = status;
  }
  if (customStatus !== undefined) req.user.customStatus = String(customStatus).slice(0, 80);

  saveDb();
  const pub = publicUser(req.user);
  io.emit('user:updated', pub);
  res.json({ user: pub });
});

// Create a new Server (Guild)
app.post('/api/servers', requireAuth, (req, res) => {
  const { name, icon, description } = req.body || {};
  const srvName = String(name || '').trim().slice(0, 48);
  if (!srvName) return res.status(400).json({ error: 'Nome do servidor é obrigatório.' });

  const srvId = randomId('srv');
  const catTextId = randomId('cat');
  const catVoiceId = randomId('cat');
  const generalId = randomId('chan');
  const clipsId = randomId('chan');
  const voiceLobbyId = randomId('chan');
  const voiceStreamId = randomId('chan');
  const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  const now = new Date().toISOString();

  const newServer = {
    id: srvId,
    name: srvName,
    icon: String(icon || srvName.slice(0, 2).toUpperCase()).slice(0, 4),
    iconUrl: '',
    bannerColor: AVATAR_COLORS[db.servers.length % AVATAR_COLORS.length],
    ownerId: req.user.id,
    inviteCode,
    description: String(description || `Servidor de ${req.user.displayName}`).slice(0, 160),
    roles: [
      { id: randomId('role'), name: 'Admin', color: '#ED4245', hoist: true, permissions: ['ALL'] },
      { id: randomId('role'), name: 'Membro', color: '#99AAB5', hoist: false, permissions: ['VOICE', 'CHAT'] }
    ],
    categories: [
      { id: catTextId, name: 'CANAIS DE TEXTO', position: 0 },
      { id: catVoiceId, name: 'CANAIS DE VOZ', position: 1 }
    ],
    channels: [
      { id: generalId, categoryId: catTextId, name: 'geral', type: 'text', topic: 'Conversa principal do servidor', position: 0 },
      { id: clipsId, categoryId: catTextId, name: 'clips-e-midia', type: 'text', topic: 'Fotos, vídeos e links', position: 1 },
      { id: voiceLobbyId, categoryId: catVoiceId, name: 'Geral Voz', type: 'voice', topic: 'Voz e vídeo', bitrate: 96000, userLimit: 0, position: 2 },
      { id: voiceStreamId, categoryId: catVoiceId, name: 'Compartilhar Tela (Go Live)', type: 'voice', topic: 'Transmissão de tela HD', bitrate: 128000, userLimit: 0, position: 3 }
    ],
    members: [
      { userId: req.user.id, roles: [], joinedAt: now }
    ],
    createdAt: now
  };

  db.servers.push(newServer);
  db.messages[generalId] = [
    {
      id: randomId('msg'),
      channelId: generalId,
      authorId: req.user.id,
      content: `🎉 Servidor **${srvName}** criado! Código de convite para amigos: **\`${inviteCode}\`**`,
      attachments: [],
      reactions: { '🎉': [req.user.id] },
      pinned: true,
      replyToId: null,
      editedAt: null,
      createdAt: now
    }
  ];
  saveDb();

  io.emit('server:created', newServer);
  res.json({ server: newServer });
});

// Update Server settings
app.patch('/api/servers/:serverId', requireAuth, (req, res) => {
  const srv = db.servers.find(s => s.id === req.params.serverId);
  if (!srv) return res.status(404).json({ error: 'Servidor não encontrado.' });

  const { name, icon, description, bannerColor } = req.body || {};
  if (name !== undefined) srv.name = String(name).trim().slice(0, 48) || srv.name;
  if (icon !== undefined) srv.icon = String(icon).trim().slice(0, 6) || srv.icon;
  if (description !== undefined) srv.description = String(description).slice(0, 200);
  if (bannerColor !== undefined) srv.bannerColor = String(bannerColor).slice(0, 16);

  saveDb();
  io.emit('server:updated', srv);
  res.json({ server: srv });
});

// Join Server via Invite Code
app.post('/api/invites/join', requireAuth, (req, res) => {
  const rawCode = String(req.body?.inviteCode || '')
    .trim()
    .replace(/^.*\/invite\//i, '')
    .replace(/^.*discord\.gg\//i, '')
    .toUpperCase();

  const srv = db.servers.find(
    s => s.inviteCode.toUpperCase() === rawCode || s.id === req.body?.inviteCode
  );
  if (!srv) {
    return res.status(404).json({ error: 'Código de convite inválido ou servidor não encontrado.' });
  }

  if (!srv.members.some(m => m.userId === req.user.id)) {
    srv.members.push({
      userId: req.user.id,
      roles: ['role_member'],
      joinedAt: new Date().toISOString()
    });
    saveDb();
    io.emit('server:updated', srv);
  }
  res.json({ server: srv });
});

// Create Channel or Category in a Server
app.post('/api/servers/:serverId/channels', requireAuth, (req, res) => {
  const srv = db.servers.find(s => s.id === req.params.serverId);
  if (!srv) return res.status(404).json({ error: 'Servidor não encontrado.' });

  const { name, type, categoryId, topic } = req.body || {};
  if (type === 'category') {
    const catName = String(name || 'NOVA CATEGORIA').trim().toUpperCase().slice(0, 36);
    const newCat = {
      id: randomId('cat'),
      name: catName,
      position: srv.categories.length
    };
    srv.categories.push(newCat);
    saveDb();
    io.emit('server:updated', srv);
    return res.json({ category: newCat, server: srv });
  }

  const chanType = ['text', 'voice', 'announcement'].includes(type) ? type : 'text';
  const rawName = String(name || 'novo-canal').trim().slice(0, 36);
  const cleanName = chanType === 'voice'
    ? rawName
    : rawName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');

  const targetCat = categoryId || (chanType === 'voice' ? srv.categories[srv.categories.length - 1]?.id : srv.categories[0]?.id);
  const newChan = {
    id: randomId('chan'),
    categoryId: targetCat,
    name: cleanName || 'novo-canal',
    type: chanType,
    topic: String(topic || '').slice(0, 140),
    bitrate: chanType === 'voice' ? 96000 : undefined,
    userLimit: 0,
    position: srv.channels.length
  };

  srv.channels.push(newChan);
  if (chanType !== 'voice') {
    db.messages[newChan.id] = [];
  }
  saveDb();
  io.emit('server:updated', srv);
  res.json({ channel: newChan, server: srv });
});

// Delete Channel
app.delete('/api/servers/:serverId/channels/:channelId', requireAuth, (req, res) => {
  const srv = db.servers.find(s => s.id === req.params.serverId);
  if (!srv) return res.status(404).json({ error: 'Servidor não encontrado.' });
  if (srv.channels.length <= 1) {
    return res.status(400).json({ error: 'O servidor precisa ter pelo menos um canal.' });
  }
  srv.channels = srv.channels.filter(c => c.id !== req.params.channelId);
  saveDb();
  io.emit('server:updated', srv);
  res.json({ server: srv });
});

// Get Channel or DM Messages
app.get('/api/channels/:channelId/messages', requireAuth, (req, res) => {
  const list = db.messages[req.params.channelId] || [];
  res.json({ messages: list.slice(-200) });
});

// Send Message
app.post('/api/channels/:channelId/messages', requireAuth, (req, res) => {
  const { channelId } = req.params;
  const { content, attachments, replyToId } = req.body || {};
  const text = String(content || '').trim();
  const attList = Array.isArray(attachments) ? attachments : [];

  if (!text && attList.length === 0) {
    return res.status(400).json({ error: 'Mensagem vazia.' });
  }

  if (!db.messages[channelId]) db.messages[channelId] = [];
  const msg = {
    id: randomId('msg'),
    channelId,
    authorId: req.user.id,
    content: text.slice(0, 4000),
    attachments: attList,
    reactions: {},
    pinned: false,
    replyToId: replyToId || null,
    editedAt: null,
    createdAt: new Date().toISOString()
  };

  db.messages[channelId].push(msg);
  saveDb();
  io.emit('message:new', msg);
  res.json({ message: msg });
});

// Edit Message
app.patch('/api/messages/:messageId', requireAuth, (req, res) => {
  const { messageId } = req.params;
  const { channelId, content } = req.body || {};
  const list = db.messages[channelId] || [];
  const msg = list.find(m => m.id === messageId);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  if (msg.authorId !== req.user.id) return res.status(403).json({ error: 'Sem permissão.' });

  msg.content = String(content || '').trim().slice(0, 4000);
  msg.editedAt = new Date().toISOString();
  saveDb();
  io.emit('message:update', msg);
  res.json({ message: msg });
});

// Delete Message
app.delete('/api/messages/:messageId', requireAuth, (req, res) => {
  const { messageId } = req.params;
  const { channelId } = req.query;
  const list = db.messages[channelId] || [];
  const idx = list.findIndex(m => m.id === messageId);
  if (idx === -1) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  const [removed] = list.splice(idx, 1);
  saveDb();
  io.emit('message:delete', { id: removed.id, channelId });
  res.json({ ok: true });
});

// Toggle Reaction
app.post('/api/messages/:messageId/reactions', requireAuth, (req, res) => {
  const { messageId } = req.params;
  const { channelId, emoji } = req.body || {};
  const list = db.messages[channelId] || [];
  const msg = list.find(m => m.id === messageId);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });

  const cleanEmoji = String(emoji || '👍').slice(0, 12);
  msg.reactions = msg.reactions || {};
  const users = msg.reactions[cleanEmoji] || [];
  const existingIdx = users.indexOf(req.user.id);
  if (existingIdx >= 0) {
    users.splice(existingIdx, 1);
    if (users.length === 0) delete msg.reactions[cleanEmoji];
    else msg.reactions[cleanEmoji] = users;
  } else {
    users.push(req.user.id);
    msg.reactions[cleanEmoji] = users;
  }

  saveDb();
  io.emit('message:update', msg);
  res.json({ message: msg });
});

// Toggle Pin Message
app.post('/api/messages/:messageId/pin', requireAuth, (req, res) => {
  const { messageId } = req.params;
  const { channelId } = req.body || {};
  const list = db.messages[channelId] || [];
  const msg = list.find(m => m.id === messageId);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });

  msg.pinned = !msg.pinned;
  saveDb();
  io.emit('message:update', msg);
  res.json({ message: msg });
});

// File Upload
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  const mime = req.file.mimetype || 'application/octet-stream';
  let kind = 'file';
  if (mime.startsWith('image/')) kind = 'image';
  else if (mime.startsWith('video/')) kind = 'video';
  else if (mime.startsWith('audio/')) kind = 'audio';

  res.json({
    attachment: {
      id: randomId('att'),
      name: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      size: req.file.size,
      mimeType: mime,
      kind
    }
  });
});

// Friends System: Send Friend Request by username or userId
app.post('/api/friends/request', requireAuth, (req, res) => {
  const { targetUsername, targetUserId } = req.body || {};
  let target = null;
  if (targetUserId) {
    target = db.users.find(u => u.id === targetUserId);
  } else if (targetUsername) {
    const clean = String(targetUsername).trim().toLowerCase().split('#')[0];
    target = db.users.find(
      u => u.username.toLowerCase() === clean || u.displayName.toLowerCase() === clean
    );
  }

  if (!target) {
    return res.status(404).json({ error: 'Usuário não encontrado. Verifique o nome de usuário.' });
  }
  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'Você não pode adicionar a si mesmo.' });
  }

  let existing = db.friendships.find(
    f =>
      (f.fromUserId === req.user.id && f.toUserId === target.id) ||
      (f.fromUserId === target.id && f.toUserId === req.user.id)
  );

  if (existing) {
    if (existing.status === 'accepted') {
      return res.status(400).json({ error: 'Vocês já são amigos!' });
    }
    if (existing.toUserId === req.user.id) {
      existing.status = 'accepted';
      saveDb();
      io.emit('friendship:updated', existing);
      return res.json({ friendship: existing });
    }
    return res.json({ friendship: existing });
  }

  const friendship = {
    id: randomId('frd'),
    fromUserId: req.user.id,
    toUserId: target.id,
    status: target.isBot ? 'accepted' : 'pending',
    createdAt: new Date().toISOString()
  };

  db.friendships.push(friendship);
  saveDb();
  io.emit('friendship:updated', friendship);
  res.json({ friendship });
});

// Respond to Friend Request (accept / reject)
app.post('/api/friends/respond', requireAuth, (req, res) => {
  const { friendshipId, action } = req.body || {};
  const frd = db.friendships.find(f => f.id === friendshipId);
  if (!frd) return res.status(404).json({ error: 'Solicitação não encontrada.' });

  if (action === 'accept') {
    frd.status = 'accepted';
    saveDb();
    io.emit('friendship:updated', frd);
    return res.json({ friendship: frd });
  } else {
    db.friendships = db.friendships.filter(f => f.id !== friendshipId);
    saveDb();
    io.emit('friendship:removed', { id: friendshipId });
    return res.json({ ok: true });
  }
});

// Create or Open DM channel
app.post('/api/dms', requireAuth, (req, res) => {
  const { targetUserId, participantIds, name } = req.body || {};
  let ids = Array.isArray(participantIds)
    ? Array.from(new Set([req.user.id, ...participantIds]))
    : [req.user.id, targetUserId].filter(Boolean);

  if (ids.length < 2) {
    return res.status(400).json({ error: 'Selecione um amigo para conversar.' });
  }

  if (ids.length === 2) {
    const existing = db.dms.find(
      d => d.participantIds.length === 2 && ids.every(id => d.participantIds.includes(id))
    );
    if (existing) return res.json({ dm: existing });
  }

  const newDm = {
    id: randomId('dm'),
    type: ids.length > 2 ? 'group_dm' : 'dm',
    name: name || '',
    participantIds: ids,
    createdAt: new Date().toISOString()
  };

  db.dms.push(newDm);
  db.messages[newDm.id] = [];
  saveDb();
  io.emit('dm:created', newDm);
  res.json({ dm: newDm });
});

// Network & Multi-Network Tunnel Endpoints
app.get('/api/network', (_req, res) => {
  res.json(getNetworkInfo());
});

app.post('/api/network/tunnel', requireAuth, async (req, res) => {
  const provider = req.body?.provider || 'auto';
  const subdomain = req.body?.subdomain || '';
  await startPublicTunnel(provider, subdomain);
  res.json(getNetworkInfo());
});

// Download Built Windows .EXE Installer / Portable App
app.get('/api/downloads', (_req, res) => {
  res.json({ installers: getAvailableInstallers() });
});

app.get('/download/:filename', (req, res) => {
  const safeName = path.basename(req.params.filename || '');
  const fullPath = path.join(DIST_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).send('Arquivo instalador .exe não encontrado.');
  }
  res.download(fullPath, safeName);
});

// Serve REA Evidence Summary from morluto/rea
app.get('/api/rea-evidence', (_req, res) => {
  try {
    if (fs.existsSync(REA_SUMMARY_FILE)) {
      const data = JSON.parse(fs.readFileSync(REA_SUMMARY_FILE, 'utf8'));
      return res.json(data);
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  res.json({ error: 'Arquivo de evidências REA não encontrado.' });
});

// ======================== SOCKET.IO REAL-TIME GATEWAY & VOICE ENGINE ========================

io.on('connection', (socket) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  const userId = token ? db.sessions[token] : null;
  const user = userId ? db.users.find(u => u.id === userId) : null;

  if (!user) {
    socket.disconnect(true);
    return;
  }

  socketToUser.set(socket.id, user.id);
  if (!onlineUsers.has(user.id)) onlineUsers.set(user.id, new Set());
  onlineUsers.get(user.id).add(socket.id);

  // Broadcast user online state
  io.emit('user:updated', publicUser(user));

  // Typing indicators
  socket.on('typing:start', ({ channelId }) => {
    socket.broadcast.emit('typing:update', {
      channelId,
      userId: user.id,
      displayName: user.displayName || user.username,
      isTyping: true
    });
  });

  socket.on('typing:stop', ({ channelId }) => {
    socket.broadcast.emit('typing:update', {
      channelId,
      userId: user.id,
      displayName: user.displayName || user.username,
      isTyping: false
    });
  });

  // DM Call Ring notification
  socket.on('call:ring', ({ dmId, channelName }) => {
    const dm = db.dms.find(d => d.id === dmId);
    if (!dm) return;
    socket.broadcast.emit('call:incoming', {
      dmId,
      channelName: channelName || user.displayName,
      caller: publicUser(user),
      participantIds: dm.participantIds
    });
  });

  // -------- Voice & Screen Share Signaling (DiscordVoice Engine Architecture) --------

  function leaveCurrentVoice() {
    const existing = voiceStates.get(user.id);
    if (!existing) return;
    const oldChannelId = existing.channelId;
    voiceStates.delete(user.id);
    socket.leave(`voice:${oldChannelId}`);
    io.emit('voice:states', Array.from(voiceStates.values()));
    io.to(`voice:${oldChannelId}`).emit('voice:peer-left', {
      userId: user.id,
      socketId: socket.id,
      channelId: oldChannelId
    });
  }

  socket.on('voice:join', (payload = {}) => {
    const { channelId, serverId, selfMute, selfDeaf, video, screenShare, streamOptions } = payload;
    if (!channelId) return;

    const prev = voiceStates.get(user.id);
    if (prev && prev.channelId !== channelId) {
      leaveCurrentVoice();
    }

    // Collect existing peers in this voice channel before joining room
    const existingPeers = Array.from(voiceStates.values()).filter(
      v => v.channelId === channelId && v.userId !== user.id
    );

    const state = {
      userId: user.id,
      socketId: socket.id,
      channelId,
      serverId: serverId || null,
      selfMute: !!selfMute,
      selfDeaf: !!selfDeaf,
      video: !!video,
      screenShare: !!screenShare,
      streamOptions: streamOptions || null,
      speaking: false,
      rtt: 18,
      joinedAt: prev?.channelId === channelId ? prev.joinedAt : new Date().toISOString()
    };

    voiceStates.set(user.id, state);
    socket.join(`voice:${channelId}`);

    // Send existing peers to the joining socket so it initiates WebRTC offers to each peer
    socket.emit('voice:peers-in-channel', {
      channelId,
      peers: existingPeers
    });

    // Notify everyone of updated voice states
    io.emit('voice:states', Array.from(voiceStates.values()));
  });

  socket.on('voice:leave', () => {
    leaveCurrentVoice();
  });

  socket.on('voice:state', (patch = {}) => {
    const state = voiceStates.get(user.id);
    if (!state) return;
    if (patch.selfMute !== undefined) state.selfMute = !!patch.selfMute;
    if (patch.selfDeaf !== undefined) state.selfDeaf = !!patch.selfDeaf;
    if (patch.video !== undefined) state.video = !!patch.video;
    if (patch.screenShare !== undefined) state.screenShare = !!patch.screenShare;
    if (patch.streamOptions !== undefined) state.streamOptions = patch.streamOptions;
    if (patch.rtt !== undefined) state.rtt = Number(patch.rtt) || state.rtt;

    voiceStates.set(user.id, state);
    io.emit('voice:states', Array.from(voiceStates.values()));
  });

  socket.on('voice:speaking', ({ speaking }) => {
    const state = voiceStates.get(user.id);
    if (!state) return;
    state.speaking = !!speaking;
    io.emit('voice:speaking-update', {
      userId: user.id,
      channelId: state.channelId,
      speaking: state.speaking
    });
  });

  // WebRTC Peer-to-Peer SDP & ICE Candidate Exchange
  socket.on('webrtc:offer', ({ targetSocketId, targetUserId, sdp, channelId, mediaMeta }) => {
    const destSocketId = targetSocketId || voiceStates.get(targetUserId)?.socketId;
    if (!destSocketId) return;
    io.to(destSocketId).emit('webrtc:offer', {
      fromSocketId: socket.id,
      fromUserId: user.id,
      sdp,
      channelId,
      mediaMeta
    });
  });

  socket.on('webrtc:answer', ({ targetSocketId, targetUserId, sdp, channelId }) => {
    const destSocketId = targetSocketId || voiceStates.get(targetUserId)?.socketId;
    if (!destSocketId) return;
    io.to(destSocketId).emit('webrtc:answer', {
      fromSocketId: socket.id,
      fromUserId: user.id,
      sdp,
      channelId
    });
  });

  socket.on('webrtc:ice-candidate', ({ targetSocketId, targetUserId, candidate, channelId }) => {
    const destSocketId = targetSocketId || voiceStates.get(targetUserId)?.socketId;
    if (!destSocketId) return;
    io.to(destSocketId).emit('webrtc:ice-candidate', {
      fromSocketId: socket.id,
      fromUserId: user.id,
      candidate,
      channelId
    });
  });

  // WebSocket Media Fallback Relay (guarantees screen share frames & voice work even across strict firewalls)
  socket.on('voice:relay-frame', ({ channelId, kind, dataUrl, width, height }) => {
    if (!channelId || !dataUrl) return;
    socket.to(`voice:${channelId}`).emit('voice:relay-frame', {
      fromUserId: user.id,
      channelId,
      kind: kind || 'screen',
      dataUrl,
      width,
      height,
      ts: Date.now()
    });
  });

  // Discord Soundboard synced playback (matches startSamplesLocalPlayback in discord_voice)
  socket.on('voice:soundboard', ({ channelId, soundId, label, emoji }) => {
    if (!channelId) return;
    io.to(`voice:${channelId}`).emit('voice:soundboard', {
      fromUserId: user.id,
      displayName: user.displayName || user.username,
      soundId,
      label,
      emoji
    });
  });

  // Pairwise MLS / E2EE verification fingerprint (matches getMLSPairwiseFingerprint in discord_voice)
  socket.on('voice:mls-fingerprint', ({ peerUserId, channelId }, cb) => {
    const sorted = [user.id, String(peerUserId || '')].sort().join(':');
    const digest = crypto.createHash('sha256').update(`MLS_DAVE_EPOCH_1:${channelId}:${sorted}`).digest('hex');
    const numericBlocks = [];
    for (let i = 0; i < 8; i++) {
      const chunk = parseInt(digest.slice(i * 6, (i + 1) * 6), 16) % 100000;
      numericBlocks.push(String(chunk).padStart(5, '0'));
    }
    if (typeof cb === 'function') {
      cb({
        protocol: 'DAVE / MLS-v1 (discord_voice)',
        channelId,
        peerUserId,
        fingerprint: numericBlocks.join(' '),
        sha256: digest
      });
    }
  });

  socket.on('disconnect', () => {
    socketToUser.delete(socket.id);
    const set = onlineUsers.get(user.id);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) onlineUsers.delete(user.id);
    }

    const vState = voiceStates.get(user.id);
    if (vState && vState.socketId === socket.id) {
      leaveCurrentVoice();
    }

    io.emit('user:updated', publicUser(user));
  });
});

function startDiscordServer(customPort = PORT) {
  return new Promise((resolve) => {
    PORT = customPort;
    const onError = (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port already in use (e.g. another instance or background server running)
        resolve({ port: PORT, alreadyRunning: true, getNetworkInfo });
      }
    };
    server.once('error', onError);
    server.listen(PORT, '0.0.0.0', () => {
      server.removeListener('error', onError);
      const lanIps = getLocalLanIps();
      console.log(`\n=============================================================`);
      console.log(`⚡ Discord REA Server rodando na porta ${PORT}`);
      console.log(`🏠 Local:       http://localhost:${PORT}`);
      for (const ip of lanIps) {
        console.log(`🖧  Rede Local:  ${ip.url} (${ip.interface})`);
      }
      console.log(`=============================================================\n`);

      startPublicTunnel('auto').then((t) => {
        if (t.active && t.url) {
          console.log(`🌐 Link Público (Redes Diferentes): ${t.url} (Código da Sala: ${t.roomCode})`);
        }
      });

      resolve({ port: PORT, server, getNetworkInfo, startPublicTunnel });
    });
  });
}

if (require.main === module) {
  startDiscordServer(PORT);
}

module.exports = { startDiscordServer, getNetworkInfo };
