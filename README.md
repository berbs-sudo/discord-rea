# ⚡ Discord Recriado com REA (`morluto/rea`)

Recriação completa do **Discord Desktop (`1.0.9262`)** guiada pela engenharia reversa real dos artefatos `app.asar`, `core.asar`, `discord_voice` e `discord_voice.node` utilizando o repositório **[morluto/rea](https://github.com/morluto/rea)**.

## 🚀 Como Iniciar

Basta dar dois cliques em **`INICIAR_DISCORD.bat`** ou rodar no terminal:

```bash
npm start
```

Depois acesse:
- **Local:** `http://localhost:3000`
- **Amigos em Redes Diferentes:** Clique no botão **`🌐 Multi-Rede Ativo`** no topo do app para copiar o link público `https://...` gerado automaticamente!

---

## 🌐 Como Usar com Amigos em Redes Diferentes

1. Ao iniciar o `server.js`, o servidor cria automaticamente um **Túnel Público HTTPS** (`cloudflared` ou `localtunnel`) e exibe o link no terminal e dentro do modal **`🌐 Convidar Amigos (Multi-Rede)`** no topo da interface.
2. Envie o link `https://.../?invite=DISCORD` para seus amigos em qualquer rede ou cidade.
3. Por utilizar `https://`, os navegadores dos seus amigos liberam automaticamente o **Microfone**, a **Câmera** e o **Compartilhamento de Tela (`getDisplayMedia`) com áudio do sistema**.
4. A conexão de mídia usa **WebRTC P2P com múltiplos servidores STUN (Google/Cloudflare) + suporte a TURN customizado + Fallback Relay via WebSocket**, garantindo que o compartilhamento de tela funcione mesmo atrás de NATs ou firewalls restritivos.

---

## 🔬 Evidências Extraídas com `morluto/rea`

Os dados completos extraídos da instalação local do Discord (`1.0.9262`) estão salvos em [`data/rea-evidence-summary.json`](./data/rea-evidence-summary.json) e podem ser inspecionados ao vivo pelo botão **`🔬 REA Inspector`** no topo do aplicativo:

| Artefato | Evidence ID (`rea-agents`) | SHA-256 Digest | Destaques Extraídos |
| :--- | :--- | :--- | :--- |
| **`app.asar`** | `ev_5676ab235c21e6daa3300a348c827794547b0b2f0bca1cc41b7e55f139f6671b` | `cbd26748b01c1b4847dc5471c4d2e1e46d69b0eb6f6c3347aa66ca992267e9b8` | `1.447` nós, `4.610` arestas, `976` módulos Webpack (`bootstrap`) |
| **`core.asar`** | `ev_b81e2a5f2aa2bbbb5c2aacc7e06c26870c64a0a97b39cbf2cf231bf7d342f619` | `48d3ebb69c1f6625ba121ab7c823b5d1fa7629cbb98d372554f1a1d1a5d0bd71` | `787` nós, `492` módulos (`bundle.js` e `mainScreenPreload.js`) |
| **`discord_voice`** | `ev_82a55f9acd4a51edc8bb7a4ddb33a1be16fee5152e948c6dac1928ff4b1eb949` | `13de73b30e12ff1dc0fa116422028cdd9cb2e42cf264d73530849c3b566a93a3` | `972` nós, contrato completo do `VoiceEngine` (`setDesktopSourceWithOptions`, `soundshare`, `remote_user_multi_stream`, `getMLSPairwiseFingerprint`) |
| **`discord_voice.node`** | `ev_9caaf76911b1bc89b3c07499c70d2651d2c189dbbcd9f200e608979d80f09f76` | `7c41c446a2ef29fa04d8f62a00193416cebebb562caa8a4d4626839729833607` | Addon nativo PE32+ do motor de mídia e voz |

