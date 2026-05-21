export function renderSidebar(userProfile = 'comum', menusPermitidos = []) {
    const currentPath = window.location.pathname;
    // Detecção robusta do prefixo do caminho (se estamos na raiz ou subpasta)
    const isInSubfolder = currentPath.split('/').filter(p => p).length > 2
        || currentPath.includes('_desktop')
        || currentPath.includes('custo_folha_dash');
    const prefix = isInSubfolder ? '../' : './';
    
    // Classes de Estilo
    const activeClass = 'text-white bg-white/10';
    const inactiveClass = 'text-blue-100/70 hover:text-white hover:bg-white/5';

    // Definição de estados ativos
    const isMasterActive = currentPath.includes('dashboard_master_desktop') ? activeClass : inactiveClass;
    const isFatActive = currentPath.includes('contas_a_receber_desktop') ? activeClass : inactiveClass;
    // Auditoria 2026-05-14: módulo legado contas_a_pagar_desktop foi exterminado
    // — só o novo Gerenciador Contas a Pagar tem entrada no menu agora.
    const isPagarActive = currentPath.includes('gerenciador_contas_pagar_desktop') ? activeClass : inactiveClass;
    const isParceirosActive = (currentPath.includes('gest_o_de_cadastros')) ? activeClass : inactiveClass;
    const isMetasActive = currentPath.includes('metas_desktop') ? activeClass : inactiveClass;
    const isCustoFolhaActive = currentPath.includes('custo_folha_desktop') ? activeClass : inactiveClass;
    // master.html agora abriga Configurações e Privacidade (abas Usuários + Auditoria).
    const isConfiguracoesActive = currentPath.includes('master.html') ? activeClass : inactiveClass;
    // Aprovações — esteira de pendências (CP_SolicitacoesAprovacao).
    // Auditoria 2026-05-18: separa governança do operacional.
    const isAprovacoesActive = currentPath.includes('aprovacoes_desktop') ? activeClass : inactiveClass;

    // Classe comum aplicada a cada link do menu — inclui borda sutil para dar aspecto premium.
    // `last:border-0` zera a borda do último item de cada seção (relativo ao seu pai direto).
    const menuLinkClass = 'mx-1 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all border-b border-white/[0.06] last:border-0';

    // Auditoria 2026-04-28: a antiga seção "Segurança e Privacidade" tinha
    // dois links (Usuários + Auditoria de Logs) que apontavam para o mesmo
    // master.html via tabs. Agora há um único ponto de entrada — "Configurações
    // e Privacidade" — exclusivo para Super Adm. As abas continuam dentro da
    // página, mas o usuário não precisa mais escolher pela sidebar.
    // Auditoria 2026-05-18 (separação governança × operacional): "Aprovações"
    // é renderizado para super_admin OU para qualquer perfil com a permissão
    // `aprovacoes` no menus_permitidos. Posicionado entre "Configurações e
    // Privacidade" (super_admin-only) e "Alterar tema" — bloco de governança.
    let adminMenuHtml = '';
    const podeVerAprovacoes = userProfile === 'super_admin' || menusPermitidos.includes('aprovacoes');
    if (userProfile === 'super_admin' || podeVerAprovacoes) {
        const itemConfiguracoes = userProfile === 'super_admin' ? `
                <a data-menu="configuracoes_privacidade" class="${isConfiguracoesActive} ${menuLinkClass}" href="${prefix}master.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px]">admin_panel_settings</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Configurações e Privacidade</span>
                </a>` : '';
        const itemAprovacoes = podeVerAprovacoes ? `
                <a data-menu="aprovacoes" class="${isAprovacoesActive} ${menuLinkClass}" href="${prefix}aprovacoes_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px] ${currentPath.includes('aprovacoes_desktop') ? 'text-amber-400' : ''}">fact_check</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Aprovações</span>
                </a>` : '';
        adminMenuHtml = `
            <div class="mt-2 pt-4 px-2">
                <p class="text-[9px] font-bold text-blue-200/40 uppercase tracking-widest px-2 mb-2 hidden group-hover:block transition-all duration-300">Segurança e Privacidade</p>
                ${itemConfiguracoes}
                ${itemAprovacoes}
            </div>
        `;
    }

    // Flag para controle de menus em produção (setar para true para ativar)
    const showProductionMenus = false;

    const sidebarHtml = `
        <aside id="main-sidebar" class="fixed left-0 top-0 h-full z-50 flex flex-col py-6 bg-[#002443] shadow-xl group transition-all duration-300 w-20 hover:w-[320px] overflow-hidden">
            <!-- LOGO -->
            <div class="p-4 mb-4 w-full flex items-center justify-center bg-[#002443]">
                <img src="${prefix}assets/logo.png.png" alt="Logo CentraFin" class="w-full h-auto object-contain drop-shadow-md transition-all duration-300" onerror="this.src='https://via.placeholder.com/150x50?text=CentraFin'" />
            </div>
            
            <!-- MENU PRINCIPAL -->
            <nav class="flex-1 flex flex-col gap-1 px-2 border-b border-white/10 pb-4 mb-4 overflow-y-auto no-scrollbar">
                <p class="text-[9px] font-bold text-blue-200/40 uppercase tracking-widest px-4 mb-2 hidden group-hover:block transition-all duration-300">Menu Financeiro</p>

                <a data-menu="dashboard_master" class="${isMasterActive} ${menuLinkClass}" href="${prefix}dashboard_master_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px] ${currentPath.includes('dashboard_master_desktop') ? 'text-primary' : ''}">dashboard</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Dashboard Geral</span>
                </a>

                <a data-menu="metas" class="${isMetasActive} ${menuLinkClass}" href="${prefix}metas_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px] ${currentPath.includes('metas_desktop') ? 'text-primary' : ''}">track_changes</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Gestão das Metas</span>
                </a>

                <a data-menu="contas_receber" class="${isFatActive} ${menuLinkClass} cursor-pointer" href="${prefix}contas_a_receber_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px] ${currentPath.includes('contas_a_receber_desktop') ? 'text-primary' : ''}">payments</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Faturamento - Contas a receber</span>
                </a>

                <a data-menu="custo_folha" class="${isCustoFolhaActive} ${menuLinkClass} cursor-pointer" href="${prefix}custo_folha_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px] ${currentPath.includes('custo_folha_desktop') ? 'text-primary' : ''}">receipt_long</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Gerenciador Folha</span>
                </a>

                <!-- Gerenciador Contas a Pagar — auditoria 2026-05-18:
                     label renomeada pra deixar claro que é o ETL operacional;
                     governança (Fornecedores) migrou pra master.html. -->
                <a data-menu="gerenciador_contas_pagar" class="${isPagarActive} ${menuLinkClass} cursor-pointer" href="${prefix}gerenciador_contas_pagar_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px] ${currentPath.includes('gerenciador_contas_pagar_desktop') ? 'text-primary' : ''}">request_quote</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Gerenciador Contas a Pagar</span>
                </a>

                ${showProductionMenus ? `
                <a data-menu="gestao_parceiros" class="${isParceirosActive} ${menuLinkClass} cursor-pointer" href="${prefix}gest_o_de_cadastros_ajuste_de_cores/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px]">group</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Gestão de Parceiros</span>
                </a>
                ` : ''}
            </nav>

            <!-- MENU ADMIN -->
            <div id="admin-menu-container">
                ${adminMenuHtml}
            </div>

            <!-- TOGGLE DE TEMA — integrado ao menu (auditoria 2026-05-14).
                 O wrapper inteiro responde ao clique (data-theme-toggle); o
                 #theme-toggle dentro mantém o pill visual já estilizado pelo
                 theme.css e o foco por teclado quando a sidebar está aberta.
                 O ícone mostra o tema que será ATIVADO se o usuário clicar —
                 preenchido na inicialização e re-sincronizado pelo
                 theme_manager.js a cada toggle. -->
            <div class="mt-auto px-2 pt-4 border-t border-white/5">
                <div data-theme-toggle title="Alternar tema claro/escuro"
                     class="text-blue-100/70 hover:text-white hover:bg-white/5 mx-1 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all cursor-pointer">
                    <span id="sidebar-theme-icon" class="material-symbols-outlined shrink-0 text-[20px]">dark_mode</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap flex-1">Alterar tema</span>
                    <button id="theme-toggle" type="button" aria-label="Alternar tema claro/escuro"
                            class="hidden group-hover:block shrink-0"></button>
                </div>
            </div>

            <!-- LOGOUT -->
            <div class="px-2 pt-2 pb-4 border-t border-white/5">
                <a href="#" id="btn-logout" class="text-red-400 hover:text-white hover:bg-red-500/20 rounded-xl px-3 py-3 flex items-center gap-3 transition-all cursor-pointer">
                    <span class="material-symbols-outlined shrink-0 text-[20px]">logout</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Sair do Sistema</span>
                </a>
            </div>
        </aside>
    `;

    const container = document.getElementById('sidebar-container');
    if (container) {
        container.innerHTML = sidebarHtml;

        // Sincroniza o ícone do toggle de tema com o tema corrente (light_mode
        // se está dark, dark_mode se está light). Se o theme_manager ainda
        // não carregou (defer), fazemos um fallback inline lendo a classe do
        // <html> diretamente — sem isso, o ícone fica fixo em "dark_mode" no
        // primeiro paint após F5.
        if (window.CentraTheme && typeof window.CentraTheme.syncIcon === 'function') {
            window.CentraTheme.syncIcon();
        } else {
            const iconEl = document.getElementById('sidebar-theme-icon');
            if (iconEl) {
                iconEl.textContent = document.documentElement.classList.contains('dark')
                    ? 'light_mode' : 'dark_mode';
            }
        }

        // OCULTAÇÃO DINÂMICA baseada em permissões
        if (userProfile === 'super_admin') {
            // BYPASS TOTAL: super_admin vê tudo — garante remoção de qualquer hidden residual
            container.querySelectorAll('[data-menu]').forEach(el => el.classList.remove('hidden'));
            const adminContainer = document.getElementById('admin-menu-container');
            if (adminContainer) adminContainer.classList.remove('hidden');
        } else {
            // Usuários comuns/master: esconde menus não permitidos
            container.querySelectorAll('[data-menu]').forEach(el => {
                if (!menusPermitidos.includes(el.getAttribute('data-menu'))) {
                    el.classList.add('hidden');
                }
            });
            // Esconde a seção "Administração" inteira se nenhum item admin estiver visível
            const adminContainer = document.getElementById('admin-menu-container');
            if (adminContainer && !adminContainer.querySelector('[data-menu]:not(.hidden)')) {
                adminContainer.classList.add('hidden');
            }
        }

        // Atrelar evento de logout
        document.getElementById('btn-logout').addEventListener('click', async (e) => {
            e.preventDefault();
            console.log("Logout acionado pelo componente");
            // Marca offline ANTES do signOut — depois do signOut as rules
            // exigem auth e a escrita falha.
            try { await marcarOffline(); } catch (_) {}
            try {
                const { getAuth, signOut } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js");
                const auth = getAuth();
                await signOut(auth);
            } catch (err) { console.error("Erro ao deslogar:", err); }
            window.location.href = prefix + "login.html";
        });

        // Guardião global de inatividade — instalado uma única vez por página
        // (renderSidebar é o choke point de toda página autenticada).
        // Spec 2026-04-30: 60 minutos sem interação → signOut + redirect login.
        installInactivityGuard(prefix);

        // Presença (Monitor de Acessos — auditoria 2026-05-14): garante is_online=true
        // ao montar a sidebar e tenta marcar offline no beforeunload. Idempotente.
        installPresenceGuard();

        // Banner de Esteira de Aprovações (Frente 4 — 2026-05-20). Só
        // dispara pra master/super_admin. Lembra a Diretoria das pendências
        // operacionais a cada login/refresh — usuários comuns nem disparam o
        // snapshot (rules bloqueiam fora dos perfis listados em
        // /CP_SolicitacoesAprovacao). Dismiss persistente por sessão.
        instalarBannerEsteiraMaster(userProfile, prefix);
    }
}

// ── BANNER DE ESTEIRA MASTER (Frente 4 — auditoria 2026-05-20) ────────────
// Único pra todas as páginas autenticadas: mostra ao master/super_admin
// quantas solicitações estão paradas em CP_SolicitacoesAprovacao. Reativo
// (onSnapshot) — o número atualiza em tempo real conforme operadores
// submetem pedidos ou outros admins liberam. Idempotente — chamadas
// repetidas em re-renders do sidebar não duplicam listeners.
let _bannerEsteiraInstalado = false;
const _BANNER_SS_KEY = 'centrafin.session.banner_esteira_dismissed';

async function instalarBannerEsteiraMaster(userProfile, prefix) {
    if (_bannerEsteiraInstalado) return;
    const perfilN = String(userProfile || '').trim().toLowerCase();
    if (perfilN !== 'master' && perfilN !== 'super_admin') return;
    // Já estamos na própria tela de Aprovações — alerta seria redundante.
    if (window.location.pathname.includes('aprovacoes_desktop')) return;
    // Dismiss persistente nesta sessão — respeita escolha do usuário.
    try {
        if (sessionStorage.getItem(_BANNER_SS_KEY) === '1') return;
    } catch (_) {}
    _bannerEsteiraInstalado = true;
    try {
        const [{ getAuth }, { getFirestore, collection, onSnapshot, query, where }] = await Promise.all([
            import("https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js"),
            import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js"),
        ]);
        // Aguarda auth estabilizar antes de subscrever (rules dependem do token).
        const auth = getAuth();
        const startListener = () => {
            const db = getFirestore();
            const q = query(collection(db, 'CP_SolicitacoesAprovacao'), where('status', '==', 'Pendente'));
            onSnapshot(q, (snap) => {
                _renderBannerEsteira(snap.size || 0, prefix);
            }, (err) => {
                console.warn('[Banner Esteira] listener falhou:', err?.code || err?.message);
            });
        };
        if (auth.currentUser) {
            startListener();
        } else {
            const { onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js");
            const unsub = onAuthStateChanged(auth, (user) => {
                if (user) { startListener(); unsub(); }
            });
        }
    } catch (e) {
        console.warn('[Banner Esteira] init falhou:', e?.message);
    }
}

function _renderBannerEsteira(total, prefix) {
    let banner = document.getElementById('cfin-banner-esteira-master');
    if (total <= 0) {
        if (banner) banner.remove();
        return;
    }
    // Verifica dismiss novamente antes de re-renderizar (defensivo: o user
    // pode fechar entre snapshots e ainda chegar um novo evento).
    try {
        if (sessionStorage.getItem(_BANNER_SS_KEY) === '1') {
            if (banner) banner.remove();
            return;
        }
    } catch (_) {}
    const plural = total === 1 ? 'solicitação aguardando' : 'solicitações aguardando';
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'cfin-banner-esteira-master';
        // Glass design — fica sobre o conteúdo sem alterar o layout existente.
        // Posicionado centralizado no top com offset à direita do sidebar
        // colapsado (left calc 80px + 50%). Não interfere em scroll do main.
        banner.className = 'fixed top-4 z-[120] flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/15 backdrop-blur-xl border border-amber-400/40 shadow-2xl shadow-amber-500/10 text-secondary';
        banner.style.left = 'calc(50% + 40px)';
        banner.style.transform = 'translateX(-50%)';
        banner.style.maxWidth = 'min(720px, calc(100vw - 120px))';
        banner.style.width = '100%';
        banner.innerHTML =
            '<span class="material-symbols-outlined text-amber-500 text-2xl shrink-0">fact_check</span>' +
            '<div class="min-w-0 flex-1">' +
                '<p class="font-headline text-sm font-extrabold leading-tight text-secondary dark:text-white">Atenção Master</p>' +
                '<p class="text-[12px] font-medium leading-snug mt-0.5 text-slate-700 dark:text-slate-200">' +
                    'Você possui <strong id="cfin-banner-count" class="tabular-nums text-amber-700 dark:text-amber-400"></strong> ' +
                    '<span id="cfin-banner-plural"></span> sua validação na Esteira de Aprovações.' +
                '</p>' +
            '</div>' +
            '<a id="cfin-banner-link" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extrabold shadow-sm hover:brightness-110 active:scale-95 transition-all shrink-0" ' +
               'style="background-color:#aad12f;color:#341100;">' +
                'Ir para Aprovações' +
                '<span class="material-symbols-outlined text-[14px]">arrow_forward</span>' +
            '</a>' +
            '<button type="button" id="cfin-banner-dismiss" class="p-1 rounded-md text-slate-500 hover:bg-amber-500/20 hover:text-secondary transition-colors shrink-0" title="Fechar até o próximo login">' +
                '<span class="material-symbols-outlined text-base">close</span>' +
            '</button>';
        document.body.appendChild(banner);
        const link = banner.querySelector('#cfin-banner-link');
        if (link) link.href = prefix + 'aprovacoes_desktop/code.html';
        const btnDismiss = banner.querySelector('#cfin-banner-dismiss');
        if (btnDismiss) {
            btnDismiss.addEventListener('click', () => {
                try { sessionStorage.setItem(_BANNER_SS_KEY, '1'); } catch (_) {}
                banner.remove();
            });
        }
    }
    const elCount  = banner.querySelector('#cfin-banner-count');
    const elPlural = banner.querySelector('#cfin-banner-plural');
    if (elCount)  elCount.textContent  = String(total);
    if (elPlural) elPlural.textContent = plural;
}

// ── MONITOR DE ACESSOS (spec 2026-05-14) ───────────────────────────────────
// Mantém Usuarios/{emailKey}.is_online + ultimo_acesso atualizados. Best-effort:
// `beforeunload` raramente conclui escrita assíncrona ao Firestore, então a UI
// do Monitor também usa heurística de tempo (last_seen < 5 min = online).
// Idempotente — uma instalação por sessão de página.
let _presenceInstalado = false;

async function marcarOffline() {
    try {
        const [{ getAuth }, { getFirestore, doc, updateDoc }] = await Promise.all([
            import("https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js"),
            import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js"),
        ]);
        const user = getAuth().currentUser;
        if (!user || !user.email) return;
        const db = getFirestore();
        const emailKey = user.email.toLowerCase();
        await updateDoc(doc(db, 'Usuarios', emailKey), { is_online: false });
    } catch (e) {
        // Esperado em alguns cenários (sessão expirada, network) — silenciar.
        console.warn('[Presence] Falha ao marcar offline:', e?.code || e?.message);
    }
}

async function marcarOnline() {
    try {
        const [{ getAuth }, { getFirestore, doc, updateDoc, serverTimestamp }] = await Promise.all([
            import("https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js"),
            import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js"),
        ]);
        const user = getAuth().currentUser;
        if (!user || !user.email) return;
        const db = getFirestore();
        const emailKey = user.email.toLowerCase();
        await updateDoc(doc(db, 'Usuarios', emailKey), {
            is_online: true,
            ultimo_acesso: serverTimestamp(),
        });
    } catch (e) {
        console.warn('[Presence] Falha ao marcar online:', e?.code || e?.message);
    }
}

function installPresenceGuard() {
    if (_presenceInstalado) return;
    _presenceInstalado = true;

    // 1) Garante online ao montar a sidebar — cobre o caso F5 em uma tela
    //    interna sem passar por login.html (que normalmente seta is_online=true).
    //    Aguarda o auth resolver via onAuthStateChanged.
    import("https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js")
        .then(({ getAuth, onAuthStateChanged }) => {
            const auth = getAuth();
            const unsub = onAuthStateChanged(auth, (user) => {
                if (user) {
                    marcarOnline();
                    unsub(); // só precisa da primeira leitura — heartbeat segue abaixo
                }
            });
        }).catch(e => console.warn('[Presence] Falha ao iniciar auth listener:', e?.message));

    // 2) Heartbeat suave a cada 4 minutos: re-afirma is_online + atualiza
    //    ultimo_acesso enquanto a aba está aberta. Cobre o caso do beforeunload
    //    falhar em marcar offline — a UI do Monitor descarta entradas com
    //    ultimo_acesso > 5 min como "stale".
    setInterval(() => marcarOnline(), 4 * 60 * 1000);

    // 3) Tenta marcar offline ao fechar a aba. Browsers limitam writes async no
    //    beforeunload — usamos `keepalive`/sendBeacon quando possível, mas o
    //    Firestore SDK não expõe isso. Fica best-effort; a heurística de tempo
    //    da UI compensa.
    window.addEventListener('beforeunload', () => {
        try { marcarOffline(); } catch (_) {}
    });
    // pagehide é mais confiável que beforeunload em alguns browsers (mobile).
    window.addEventListener('pagehide', () => {
        try { marcarOffline(); } catch (_) {}
    });
}

// ── INACTIVITY GUARD (spec 2026-04-30) ──────────────────────────────────────
// Conta 60 min de ociosidade. Eventos monitorados: mousemove (throttled 5s),
// keydown, click, scroll. Após o limite: signOut(), limpa session storage e
// redireciona para login.html. Idempotente — se renderSidebar for chamada de
// novo na mesma página (defensivo), o guard antigo é desmontado primeiro.
const TIMEOUT_INATIVIDADE_MS = 60 * 60 * 1000; // 1 hora exata = 3.600.000 ms
const THROTTLE_MOUSEMOVE_MS  = 5000;            // mousemove dispara no máx. 1x/5s

let _inactivityHandle = null;
let _inactivityTimer = null;
let _lastMouseMoveAt = 0;

function installInactivityGuard(prefix) {
    // Idempotente: se já instalado, desmonta antes de reinstalar.
    if (_inactivityHandle && typeof _inactivityHandle.uninstall === 'function') {
        _inactivityHandle.uninstall();
    }

    const dispararLogout = async () => {
        try {
            console.log('[InactivityGuard] 60 min sem atividade — encerrando sessão.');
            // Limpa storage local (qualquer state da sessão atual).
            try { sessionStorage.clear(); } catch (_) {}
            try {
                // Preserva preferências de filtros/persistência longa em
                // localStorage — apenas estado realmente "de sessão" sai.
                Object.keys(localStorage).forEach(k => {
                    if (k.startsWith('centrafin.session.')) localStorage.removeItem(k);
                });
            } catch (_) {}

            const { getAuth, signOut } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js");
            const auth = getAuth();
            await signOut(auth);
        } catch (err) {
            console.error('[InactivityGuard] falha no signOut:', err);
        } finally {
            window.location.replace(prefix + "login.html");
        }
    };

    const reagendar = () => {
        if (_inactivityTimer) clearTimeout(_inactivityTimer);
        _inactivityTimer = setTimeout(dispararLogout, TIMEOUT_INATIVIDADE_MS);
    };

    // Handlers — throttling leve em mousemove pra não martelar setTimeout.
    const onMouseMove = () => {
        const now = Date.now();
        if (now - _lastMouseMoveAt < THROTTLE_MOUSEMOVE_MS) return;
        _lastMouseMoveAt = now;
        reagendar();
    };
    const onAtividade = () => reagendar();

    // Listeners passivos (scroll/touch) para não impactar fluência.
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('keydown',   onAtividade, { passive: true });
    window.addEventListener('click',     onAtividade, { passive: true });
    window.addEventListener('scroll',    onAtividade, { passive: true });
    window.addEventListener('touchstart', onAtividade, { passive: true });

    // Primeiro agendamento — o relógio começa a partir do load da página.
    reagendar();

    _inactivityHandle = {
        uninstall() {
            if (_inactivityTimer) { clearTimeout(_inactivityTimer); _inactivityTimer = null; }
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('keydown', onAtividade);
            window.removeEventListener('click', onAtividade);
            window.removeEventListener('scroll', onAtividade);
            window.removeEventListener('touchstart', onAtividade);
        }
    };
}

