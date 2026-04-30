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
    const isPagarActive = currentPath.includes('contas_a_pagar_desktop') ? activeClass : inactiveClass;
    const isParceirosActive = (currentPath.includes('gest_o_de_cadastros')) ? activeClass : inactiveClass;
    const isMetasActive = currentPath.includes('metas_desktop') ? activeClass : inactiveClass;
    const isCustoFolhaActive = currentPath.includes('custo_folha_desktop') ? activeClass : inactiveClass;
    // master.html agora abriga Configurações e Privacidade (abas Usuários + Auditoria).
    const isConfiguracoesActive = currentPath.includes('master.html') ? activeClass : inactiveClass;

    // Classe comum aplicada a cada link do menu — inclui borda sutil para dar aspecto premium.
    // `last:border-0` zera a borda do último item de cada seção (relativo ao seu pai direto).
    const menuLinkClass = 'mx-1 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all border-b border-white/[0.06] last:border-0';

    // Auditoria 2026-04-28: a antiga seção "Segurança e Privacidade" tinha
    // dois links (Usuários + Auditoria de Logs) que apontavam para o mesmo
    // master.html via tabs. Agora há um único ponto de entrada — "Configurações
    // e Privacidade" — exclusivo para Super Adm. As abas continuam dentro da
    // página, mas o usuário não precisa mais escolher pela sidebar.
    let adminMenuHtml = '';
    if (userProfile === 'super_admin') {
        adminMenuHtml = `
            <div class="mt-2 pt-4 px-2">
                <p class="text-[9px] font-bold text-blue-200/40 uppercase tracking-widest px-2 mb-2 hidden group-hover:block transition-all duration-300">Segurança e Privacidade</p>

                <a data-menu="configuracoes_privacidade" class="${isConfiguracoesActive} ${menuLinkClass}" href="${prefix}master.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px]">admin_panel_settings</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Configurações e Privacidade</span>
                </a>
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
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Metas Financeiras</span>
                </a>

                <a data-menu="contas_receber" class="${isFatActive} ${menuLinkClass} cursor-pointer" href="${prefix}contas_a_receber_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px] ${currentPath.includes('contas_a_receber_desktop') ? 'text-primary' : ''}">payments</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Faturamento - Contas a receber</span>
                </a>

                <a data-menu="custo_folha" class="${isCustoFolhaActive} ${menuLinkClass} cursor-pointer" href="${prefix}custo_folha_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px] ${currentPath.includes('custo_folha_desktop') ? 'text-primary' : ''}">receipt_long</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Custo de Folha</span>
                </a>

                <!-- Contas a Pagar — Fase 1 ativada (auditoria 2026-04-28). -->
                <a data-menu="contas_pagar" class="${isPagarActive} ${menuLinkClass} cursor-pointer" href="${prefix}contas_a_pagar_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px] ${currentPath.includes('contas_a_pagar_desktop') ? 'text-primary' : ''}">account_balance_wallet</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Contas a Pagar</span>
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

            <!-- LOGOUT -->
            <div class="mt-auto px-2 pt-4 pb-4 border-t border-white/5">
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
    }
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

