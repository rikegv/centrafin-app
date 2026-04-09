export function renderSidebar(userProfile = 'comum', menusPermitidos = []) {
    const currentPath = window.location.pathname;
    // Detecção robusta do prefixo do caminho (se estamos na raiz ou subpasta)
    const isInSubfolder = currentPath.split('/').filter(p => p).length > 2 || currentPath.includes('_desktop') || currentPath.includes('_mobile');
    const prefix = isInSubfolder ? '../' : './';
    
    // Classes de Estilo
    const activeClass = 'text-white bg-white/10';
    const inactiveClass = 'text-blue-100/70 hover:text-white hover:bg-white/5';

    // Definição de estados ativos
    const isMasterActive = currentPath.includes('dashboard_master_desktop') ? activeClass : inactiveClass;
    const isFatActive = (currentPath.includes('contas_a_receber_desktop') || currentPath.includes('contas_a_receber_mobile')) ? activeClass : inactiveClass;
    const isPagarActive = (currentPath.includes('contas_a_pagar_desktop') || currentPath.includes('contas_a_pagar_mobile')) ? activeClass : inactiveClass;
    const isParceirosActive = (currentPath.includes('gest_o_de_cadastros')) ? activeClass : inactiveClass;
    const isExtratoActive = (currentPath.includes('extrato_desktop')) ? activeClass : inactiveClass;
    const isMetasActive = currentPath.includes('metas_desktop') ? activeClass : inactiveClass;
    const isUsuariosActive = currentPath.includes('master.html') && !currentPath.includes('tab=logs') ? activeClass : inactiveClass;
    const isAuditoriaActive = currentPath.includes('tab=logs') ? activeClass : inactiveClass;

    let adminMenuHtml = '';
    if (userProfile === 'master' || userProfile === 'super_admin') {
        adminMenuHtml = `
            <div class="border-t border-white/10 mt-2 pt-4 px-2">
                <p class="text-[9px] font-bold text-blue-200/40 uppercase tracking-widest px-2 mb-2 hidden group-hover:block transition-all duration-300">Administração</p>
                
                <a data-menu="usuarios" class="${isUsuariosActive} mx-1 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all" href="${prefix}master.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px]">manage_accounts</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Usuários</span>
                </a>

                <a data-menu="auditoria" class="${isAuditoriaActive} mx-1 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all" href="${prefix}master.html?tab=logs">
                    <span class="material-symbols-outlined shrink-0 text-[20px] text-blue-400">policy</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Auditoria (Logs)</span>
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
                
                <a data-menu="dashboard_master" class="${isMasterActive} mx-1 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all" href="${prefix}dashboard_master_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px] ${currentPath.includes('dashboard_master_desktop') ? 'text-primary' : ''}">dashboard</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Dashboard Geral</span>
                </a>

                <a data-menu="metas" class="${isMetasActive} mx-1 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all" href="${prefix}metas_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px] ${currentPath.includes('metas_desktop') ? 'text-primary' : ''}">track_changes</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Metas Financeiras</span>
                </a>

                <a data-menu="contas_receber" class="${isFatActive} mx-1 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all cursor-pointer" href="${prefix}contas_a_receber_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px] ${currentPath.includes('contas_a_receber_desktop') ? 'text-primary' : ''}">payments</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Faturamento - Contas a receber</span>
                </a>

                ${showProductionMenus ? `
                <a data-menu="contas_pagar" class="${isPagarActive} mx-1 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all cursor-pointer" href="${prefix}contas_a_pagar_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px]">account_balance_wallet</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Contas a Pagar</span>
                </a>

                <a data-menu="gestao_parceiros" class="${isParceirosActive} mx-1 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all cursor-pointer" href="${prefix}gest_o_de_cadastros_ajuste_de_cores/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px]">group</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Gestão de Parceiros</span>
                </a>

                <a data-menu="extrato" class="${isExtratoActive} mx-1 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all cursor-pointer" href="${prefix}extrato_desktop/code.html">
                    <span class="material-symbols-outlined shrink-0 text-[20px]">receipt_long</span>
                    <span class="font-bold text-sm hidden group-hover:block whitespace-nowrap">Extrato Geral</span>
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
    }
}

