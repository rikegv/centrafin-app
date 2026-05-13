/**
 * centrafin_chatbot.js — Módulo de interface do Assistente Executivo IA
 * Injeta o widget de chat (botão flutuante + modal) em qualquer página CentraFin.
 *
 * USO: <script src="../ai_assistant/centrafin_chatbot.js" defer></script>
 *
 * ENDPOINT: substitua CLOUD_FUNCTION_URL pela URL real após o deploy.
 */

(function () {
  'use strict';

  // ── Configuração ──────────────────────────────────────────────
  const CLOUD_FUNCTION_URL =
    'https://southamerica-east1-YOUR_PROJECT_ID.cloudfunctions.net/centrafin_ai_chat';

  // Histórico em memória (session only — sem persistência localStorage)
  let historico = [];
  let isOpen = false;
  let isThinking = false;

  // ── Injetar CSS ───────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    /* ── Chatbot Widget ─────────────────────────────────── */
    #cfin-chat-btn {
      position: fixed; bottom: 28px; right: 28px; z-index: 1000;
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #aad12f 0%, #7fb520 100%);
      border: none; cursor: pointer; box-shadow: 0 4px 20px rgba(170,209,47,0.5);
      display: flex; align-items: center; justify-content: center;
      transition: transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s ease;
      animation: cfin-pulse 2.8s ease-in-out infinite;
    }
    #cfin-chat-btn:hover {
      transform: scale(1.12) translateY(-3px);
      box-shadow: 0 8px 32px rgba(170,209,47,0.65);
      animation: none;
    }
    #cfin-chat-btn .material-symbols-outlined { color: #002443; font-size: 26px; font-variation-settings: 'FILL' 1; }

    @keyframes cfin-pulse {
      0%, 100% { box-shadow: 0 4px 20px rgba(170,209,47,0.4); }
      50%       { box-shadow: 0 4px 32px rgba(170,209,47,0.75), 0 0 0 8px rgba(170,209,47,0.08); }
    }

    /* Badge de notificação */
    #cfin-chat-badge {
      position: absolute; top: -4px; right: -4px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #ef4444; color: white; font-size: 10px;
      font-weight: 800; font-family: 'Manrope', sans-serif;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid white; display: none;
    }

    /* ── Modal ───────────────────────────────────────────── */
    #cfin-chat-modal {
      position: fixed; bottom: 96px; right: 28px; z-index: 999;
      width: 400px; max-width: calc(100vw - 40px);
      height: 560px; max-height: calc(100vh - 120px);
      background: #0f1923;
      border: 1px solid rgba(170,209,47,0.2);
      border-radius: 20px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(170,209,47,0.08);
      display: flex; flex-direction: column;
      overflow: hidden;
      transform: translateY(20px) scale(0.95);
      opacity: 0; pointer-events: none;
      transition: transform .3s cubic-bezier(.2,.8,.2,1), opacity .25s ease;
    }
    #cfin-chat-modal.open {
      transform: translateY(0) scale(1);
      opacity: 1; pointer-events: all;
    }

    /* Header do modal */
    #cfin-chat-header {
      background: linear-gradient(135deg, #002443 0%, #003560 100%);
      padding: 14px 18px;
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 1px solid rgba(170,209,47,0.15);
      flex-shrink: 0;
    }
    #cfin-chat-header .cfin-header-info { display: flex; align-items: center; gap: 10px; }
    #cfin-chat-header .cfin-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, #aad12f, #7fb520);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    #cfin-chat-header .cfin-avatar .material-symbols-outlined { color: #002443; font-size: 18px; font-variation-settings: 'FILL' 1; }
    #cfin-chat-header h3 {
      color: #fff; font-size: 13px; font-weight: 800;
      font-family: 'Manrope', sans-serif; margin: 0; line-height: 1.2;
    }
    #cfin-chat-header p {
      color: rgba(255,255,255,0.45); font-size: 10px;
      font-family: 'Manrope', sans-serif; margin: 0; font-weight: 500;
    }
    #cfin-chat-online {
      width: 8px; height: 8px; border-radius: 50%;
      background: #aad12f; box-shadow: 0 0 6px rgba(170,209,47,0.8);
      animation: cfin-blink 2s ease-in-out infinite;
    }
    @keyframes cfin-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    #cfin-btn-close-modal {
      background: transparent; border: none; cursor: pointer;
      color: rgba(255,255,255,0.4); padding: 4px; border-radius: 8px;
      transition: color .2s, background .2s;
      display: flex; align-items: center;
    }
    #cfin-btn-close-modal:hover { color: #fff; background: rgba(255,255,255,0.08); }
    #cfin-btn-close-modal .material-symbols-outlined { font-size: 20px; }

    /* Área de mensagens */
    #cfin-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
      scroll-behavior: smooth;
    }
    #cfin-chat-messages::-webkit-scrollbar { width: 4px; }
    #cfin-chat-messages::-webkit-scrollbar-track { background: transparent; }
    #cfin-chat-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

    /* Mensagens */
    .cfin-msg {
      display: flex; gap: 8px; align-items: flex-end;
      animation: cfin-msg-in .3s ease-out;
    }
    @keyframes cfin-msg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .cfin-msg.user { flex-direction: row-reverse; }

    .cfin-msg-bubble {
      max-width: 78%; padding: 10px 14px; border-radius: 14px;
      font-family: 'Manrope', sans-serif; font-size: 13px; line-height: 1.55;
    }
    .cfin-msg.assistant .cfin-msg-bubble {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      color: #e2e8f0; border-bottom-left-radius: 4px;
    }
    .cfin-msg.user .cfin-msg-bubble {
      background: linear-gradient(135deg, #aad12f, #8ec228);
      color: #002443; font-weight: 700; border-bottom-right-radius: 4px;
    }
    .cfin-msg-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      flex-shrink: 0; display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 800; font-family: 'Manrope', sans-serif;
    }
    .cfin-msg.assistant .cfin-msg-avatar {
      background: linear-gradient(135deg, #002443, #003560);
      border: 1px solid rgba(170,209,47,0.3);
    }
    .cfin-msg.assistant .cfin-msg-avatar .material-symbols-outlined {
      font-size: 14px; color: #aad12f; font-variation-settings: 'FILL' 1;
    }
    .cfin-msg.user .cfin-msg-avatar {
      background: #1e293b; color: #94a3b8;
    }

    /* Typing indicator */
    #cfin-typing {
      display: none; align-items: flex-end; gap: 8px;
      animation: cfin-msg-in .3s ease-out;
    }
    #cfin-typing.visible { display: flex; }
    .cfin-typing-bubble {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px; border-bottom-left-radius: 4px;
      padding: 12px 16px; display: flex; gap: 5px; align-items: center;
    }
    .cfin-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: rgba(170,209,47,0.6);
      animation: cfin-dot-bounce 1.2s ease-in-out infinite;
    }
    .cfin-dot:nth-child(2) { animation-delay: .2s; }
    .cfin-dot:nth-child(3) { animation-delay: .4s; }
    @keyframes cfin-dot-bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.6; } 40% { transform: translateY(-6px); opacity: 1; } }

    /* Input area */
    #cfin-chat-footer {
      padding: 12px 14px;
      background: rgba(255,255,255,0.03);
      border-top: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
    }
    #cfin-chat-form {
      display: flex; gap: 8px; align-items: flex-end;
    }
    #cfin-chat-input {
      flex: 1; background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; padding: 10px 14px;
      color: #f1f5f9; font-family: 'Manrope', sans-serif; font-size: 13px;
      resize: none; outline: none; min-height: 42px; max-height: 100px;
      line-height: 1.5; transition: border-color .2s;
    }
    #cfin-chat-input:focus { border-color: rgba(170,209,47,0.5); }
    #cfin-chat-input::placeholder { color: rgba(255,255,255,0.25); }
    #cfin-btn-send {
      width: 42px; height: 42px; border-radius: 12px;
      background: linear-gradient(135deg, #aad12f, #8ec228);
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: transform .2s, box-shadow .2s; flex-shrink: 0;
    }
    #cfin-btn-send:hover:not(:disabled) { transform: scale(1.08); box-shadow: 0 4px 16px rgba(170,209,47,0.4); }
    #cfin-btn-send:disabled { opacity: 0.4; cursor: not-allowed; }
    #cfin-btn-send .material-symbols-outlined { color: #002443; font-size: 20px; font-variation-settings: 'FILL' 1; }

    /* Sugestões rápidas */
    #cfin-suggestions {
      display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
    }
    .cfin-suggestion-btn {
      background: rgba(170,209,47,0.08); border: 1px solid rgba(170,209,47,0.2);
      border-radius: 8px; padding: 5px 10px;
      color: rgba(170,209,47,0.85); font-family: 'Manrope', sans-serif;
      font-size: 11px; font-weight: 600; cursor: pointer;
      transition: background .2s, transform .15s;
    }
    .cfin-suggestion-btn:hover { background: rgba(170,209,47,0.15); transform: translateY(-1px); }

    /* Mensagem de boas-vindas */
    #cfin-welcome {
      text-align: center; padding: 24px 16px;
    }
    #cfin-welcome .cfin-welcome-icon {
      width: 52px; height: 52px; border-radius: 50%;
      background: linear-gradient(135deg, rgba(170,209,47,0.2), rgba(170,209,47,0.05));
      border: 1px solid rgba(170,209,47,0.25);
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 12px;
    }
    #cfin-welcome .material-symbols-outlined { color: #aad12f; font-size: 24px; font-variation-settings: 'FILL' 1; }
    #cfin-welcome h4 { color: #f1f5f9; font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 800; margin: 0 0 6px; }
    #cfin-welcome p { color: rgba(255,255,255,0.4); font-family: 'Manrope', sans-serif; font-size: 12px; margin: 0; line-height: 1.6; }
  `;
  document.head.appendChild(style);

  // ── Injetar HTML ──────────────────────────────────────────────
  const html = `
    <button id="cfin-chat-btn" title="Assistente IA CentraFin" aria-label="Abrir assistente de IA">
      <span class="material-symbols-outlined">auto_awesome</span>
      <span id="cfin-chat-badge">1</span>
    </button>

    <div id="cfin-chat-modal" role="dialog" aria-modal="true" aria-label="Assistente Executivo IA">
      <div id="cfin-chat-header">
        <div class="cfin-header-info">
          <div class="cfin-avatar">
            <span class="material-symbols-outlined">auto_awesome</span>
          </div>
          <div>
            <h3>CFO Virtual · CentraFin</h3>
            <p>Assistente de Inteligência Financeira</p>
          </div>
          <div id="cfin-chat-online" style="margin-left:4px;"></div>
        </div>
        <button id="cfin-btn-close-modal" aria-label="Fechar chat">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div id="cfin-chat-messages">
        <div id="cfin-welcome">
          <div class="cfin-welcome-icon">
            <span class="material-symbols-outlined">auto_awesome</span>
          </div>
          <h4>Olá! Sou o CFO Virtual.</h4>
          <p>Pergunte sobre faturamento, inadimplência,<br>metas ou qualquer KPI financeiro.</p>
        </div>
        <div id="cfin-typing">
          <div class="cfin-msg-avatar" style="background:linear-gradient(135deg,#002443,#003560);border:1px solid rgba(170,209,47,0.3);width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;">
            <span class="material-symbols-outlined" style="font-size:14px;color:#aad12f;font-variation-settings:'FILL' 1;">auto_awesome</span>
          </div>
          <div class="cfin-typing-bubble">
            <div class="cfin-dot"></div>
            <div class="cfin-dot"></div>
            <div class="cfin-dot"></div>
          </div>
        </div>
      </div>

      <div id="cfin-chat-footer">
        <form id="cfin-chat-form" autocomplete="off">
          <textarea
            id="cfin-chat-input"
            placeholder="Ex: Qual o faturamento realizado em março 2026?"
            rows="1"
            aria-label="Digite sua pergunta"
          ></textarea>
          <button type="submit" id="cfin-btn-send" aria-label="Enviar mensagem">
            <span class="material-symbols-outlined">send</span>
          </button>
        </form>
        <div id="cfin-suggestions">
          <button class="cfin-suggestion-btn" data-prompt="Qual o faturamento realizado total em 2026?">Realizado 2026</button>
          <button class="cfin-suggestion-btn" data-prompt="Faturamento bruto da SOULAN ADM no mês atual?">Bruto SOULAN ADM</button>
          <button class="cfin-suggestion-btn" data-prompt="Quantas notas estão vencidas hoje?">Notas vencidas</button>
        </div>
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  // ── Referências DOM ───────────────────────────────────────────
  const btn         = document.getElementById('cfin-chat-btn');
  const modal       = document.getElementById('cfin-chat-modal');
  const closeBtn    = document.getElementById('cfin-btn-close-modal');
  const form        = document.getElementById('cfin-chat-form');
  const input       = document.getElementById('cfin-chat-input');
  const sendBtn     = document.getElementById('cfin-btn-send');
  const messages    = document.getElementById('cfin-chat-messages');
  const typing      = document.getElementById('cfin-typing');
  const welcome     = document.getElementById('cfin-welcome');
  const badge       = document.getElementById('cfin-chat-badge');
  const suggestions = document.getElementById('cfin-suggestions');

  // ── Helpers ───────────────────────────────────────────────────
  function openModal() {
    isOpen = true;
    modal.classList.add('open');
    badge.style.display = 'none';
    setTimeout(() => input.focus(), 320);
  }

  function closeModal() {
    isOpen = false;
    modal.classList.remove('open');
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function adicionarMensagem(role, texto) {
    if (welcome && welcome.parentNode === messages) {
      welcome.style.display = 'none';
    }

    const div = document.createElement('div');
    div.className = `cfin-msg ${role}`;

    const avatarHtml = role === 'assistant'
      ? `<div class="cfin-msg-avatar"><span class="material-symbols-outlined">auto_awesome</span></div>`
      : `<div class="cfin-msg-avatar" style="font-size:12px;font-weight:800;font-family:'Manrope',sans-serif;color:#94a3b8;">EU</div>`;

    div.innerHTML = `
      ${avatarHtml}
      <div class="cfin-msg-bubble">${texto.replace(/\n/g, '<br>')}</div>
    `;

    // Inserir antes do indicador de digitação
    messages.insertBefore(div, typing);
    scrollToBottom();
  }

  function setThinking(val) {
    isThinking = val;
    typing.classList.toggle('visible', val);
    sendBtn.disabled = val;
    input.disabled = val;
    if (val) scrollToBottom();
  }

  // ── Obter token Firebase ──────────────────────────────────────
  async function getFirebaseToken() {
    try {
      const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js');
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error('Usuário não autenticado.');
      return user.getIdToken();
    } catch {
      return null;
    }
  }

  // ── Chamada ao backend ────────────────────────────────────────
  async function enviarMensagem(prompt) {
    if (!prompt.trim() || isThinking) return;

    // Esconder sugestões após primeira mensagem
    suggestions.style.display = 'none';

    adicionarMensagem('user', prompt);
    historico.push({ role: 'user', content: prompt });
    setThinking(true);

    try {
      const token = await getFirebaseToken();

      // ── MODO DEMO (sem token / sem deploy) ──
      if (!token || CLOUD_FUNCTION_URL.includes('YOUR_PROJECT_ID')) {
        await new Promise(r => setTimeout(r, 1500));
        const respostaDemo = gerarRespostaDemo(prompt);
        adicionarMensagem('assistant', respostaDemo);
        historico.push({ role: 'assistant', content: respostaDemo });
        setThinking(false);
        return;
      }

      const response = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt,
          historico: historico.slice(-8),
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const resposta = data.resposta || 'Não obtive uma resposta. Tente novamente.';

      adicionarMensagem('assistant', resposta);
      historico.push({ role: 'assistant', content: resposta });

    } catch (err) {
      console.error('[Chatbot]', err);
      adicionarMensagem('assistant',
        '⚠️ Não foi possível conectar ao assistente agora. Verifique sua conexão e tente novamente.');
    } finally {
      setThinking(false);
    }
  }

  // ── Respostas demo (quando endpoint não está configurado) ─────
  function gerarRespostaDemo(prompt) {
    const p = prompt.toLowerCase();
    const now = new Date();
    const mes = now.toLocaleString('pt-BR', { month: 'long' });
    const ano = now.getFullYear();

    if (p.includes('realizado')) {
      return `📊 **Faturamento Realizado**\n\nEsta é uma resposta de demonstração. Quando o endpoint estiver configurado, consultarei os dados reais do Firestore e calcularei o Faturamento Realizado usando as regras do core_rules:\n\n• **Grupo A** (Temporário, Estágio, Terceiros, FOPAG, Consultoria, RPO): 100% da Taxa\n• **Grupo B** (Treinamento, Assessment, Subscription...): 55% da Taxa\n\nConfigure a variável CLOUD_FUNCTION_URL no chatbot para ativar.`;
    }
    if (p.includes('bruto')) {
      return `💰 **Faturamento Bruto**\n\nEm modo de demonstração. O faturamento bruto corresponde ao valor total das notas fiscais emitidas, sem aplicação dos descontos.\n\nPara dados reais, conecte ao endpoint da Cloud Function.`;
    }
    if (p.includes('vencid') || p.includes('inadimpl')) {
      return `🔴 **Notas Vencidas / Inadimplência**\n\nEm modo de demonstração. O status das notas é calculado com base na data de vencimento comparada à data atual (${mes}/${ano}), usando a função obterStatusReal() do core_rules.\n\nConecte ao endpoint para dados reais.`;
    }
    return `🤖 **Assistente em modo demo**\n\nSeu prompt foi recebido: *"${prompt}"*\n\nPara ativar o assistente com dados reais:\n1. Faça o deploy da Cloud Function: \`firebase deploy --only functions\`\n2. Configure a variável CLOUD_FUNCTION_URL no arquivo centrafin_chatbot.js\n3. Defina as variáveis de ambiente OPENAI_API_KEY ou ANTHROPIC_API_KEY`;
  }

  // ── Event Listeners ───────────────────────────────────────────
  btn.addEventListener('click', () => isOpen ? closeModal() : openModal());
  closeBtn.addEventListener('click', closeModal);

  // Fechar ao clicar fora
  document.addEventListener('click', e => {
    if (isOpen && !modal.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      closeModal();
    }
  });

  // Envio do formulário
  form.addEventListener('submit', e => {
    e.preventDefault();
    const texto = input.value.trim();
    if (!texto) return;
    input.value = '';
    input.style.height = 'auto';
    enviarMensagem(texto);
  });

  // Auto-resize do textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });

  // Enter para enviar (Shift+Enter = nova linha)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });

  // Sugestões rápidas
  document.querySelectorAll('.cfin-suggestion-btn').forEach(b => {
    b.addEventListener('click', () => enviarMensagem(b.dataset.prompt));
  });

  // Badge de boas-vindas após 3s (só na primeira vez)
  if (!sessionStorage.getItem('cfin_chat_seen')) {
    setTimeout(() => {
      if (!isOpen) {
        badge.style.display = 'flex';
        sessionStorage.setItem('cfin_chat_seen', '1');
      }
    }, 3000);
  }

})();
