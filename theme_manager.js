/* ─────────────────────────────────────────────────────────────────────────
   Centra Fin — Theme Manager (global)
   - Lê/escreve `localStorage('centrafin-theme')` (valores: 'light' | 'dark').
   - Auditoria 2026-05-14: o toggle vive APENAS dentro do menu lateral
     (renderSidebar). Removemos o auto-mount flutuante. Wire passa a usar
     event delegation no `document` — sobrevive a re-renders da sidebar e
     funciona mesmo que o elemento ainda não exista quando este script roda.
   - Atualiza ApexCharts (mode + tooltip) quando os charts existem.

   IMPORTANTE: o boot que aplica a classe em <html> precisa rodar ANTES do
   paint, então fica inline no <head> de cada página. Este arquivo é o
   wire-up, carregado com `defer`.
   ───────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var STORAGE_KEY = 'centrafin-theme';

  function getSavedTheme() {
    try { return localStorage.getItem(STORAGE_KEY) || 'light'; }
    catch (e) { return 'light'; }
  }

  function applyTheme(modo) {
    var alvo = modo === 'dark' ? 'dark' : 'light';
    var html = document.documentElement;
    html.classList.remove('light', 'dark');
    html.classList.add(alvo);
    try { localStorage.setItem(STORAGE_KEY, alvo); } catch (e) {}
    aplicarThemeCharts(alvo);
    sincronizarIconeSidebar();
  }

  function toggleTheme() {
    var atual = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    applyTheme(atual === 'dark' ? 'light' : 'dark');
  }

  // Atualiza o ícone "preview" dentro do item de menu da sidebar.
  // Convenção: mostramos o tema que será ATIVADO se o usuário clicar.
  //   - tema atual dark  → ícone light_mode (sol)
  //   - tema atual light → ícone dark_mode  (lua)
  // Idempotente. Se a sidebar ainda não renderizou, simplesmente não faz nada.
  function sincronizarIconeSidebar() {
    var icon = document.getElementById('sidebar-theme-icon');
    if (!icon) return;
    var isDark = document.documentElement.classList.contains('dark');
    icon.textContent = isDark ? 'light_mode' : 'dark_mode';
  }

  // Sincroniza ApexCharts globais (Master) — opcional; se a página não usar Apex, é no-op.
  function aplicarThemeCharts(modo) {
    if (typeof ApexCharts === 'undefined') return;
    var keysGlobais = [
      'chartBrutoGlobal', 'chartRealGlobal', 'chartEmpresaGlobal', 'chartServicoGlobal',
      'chartComercialGlobal', 'chartThomasBrutoGlobal', 'chartThomasRealGlobal',
      'chartThomasServicoGlobal', 'chartThomasComercialGlobal',
      'chartEmissoes30Dias', 'chartEmissoesAno',
      'chartMetaAnualFat', 'chartMetaAnualBruto', 'chartMetasMensal',
      'chartVencidosEmpresa', 'chartAgingFaixas',
      'chartCrInadMensal', 'chartCrRecDiarios'
    ];
    keysGlobais.forEach(function (k) {
      var c = window[k];
      if (c && typeof c.updateOptions === 'function') {
        try { c.updateOptions({ theme: { mode: modo }, tooltip: { theme: modo } }, false, false); } catch (e) {}
      }
    });
    if (window.graficosGauges) {
      Object.values(window.graficosGauges).forEach(function (c) {
        if (c && typeof c.updateOptions === 'function') {
          try { c.updateOptions({ theme: { mode: modo } }, false, false); } catch (e) {}
        }
      });
    }
  }

  // Wire via event delegation no documento. O alvo pode ser:
  //   - qualquer descendente do wrapper marcado com [data-theme-toggle]
  //     (linha inteira do menu — funciona com a sidebar retraída clicando
  //     no ícone);
  //   - o próprio botão #theme-toggle (acessibilidade por teclado/Tab).
  // Como o button vive dentro do wrapper [data-theme-toggle], um único
  // closest('[data-theme-toggle]') já cobre os dois caminhos.
  function wireDelegacao() {
    if (document._centraThemeWired) return; // idempotente
    document._centraThemeWired = true;
    document.addEventListener('click', function (ev) {
      var alvo = ev.target;
      if (!alvo || !alvo.closest) return;
      var linha = alvo.closest('[data-theme-toggle]');
      if (!linha) return;
      ev.preventDefault();
      toggleTheme();
    });
  }

  function init() {
    wireDelegacao();
    sincronizarIconeSidebar(); // sidebar pode já ter renderizado antes do init

    // Reaplica o tema atual nos ApexCharts a cada 500ms por ~6s, porque os
    // charts costumam ser instanciados dentro de listeners assíncronos do Firebase.
    var modoAtual = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    var tentativas = 0;
    var iv = setInterval(function () {
      aplicarThemeCharts(modoAtual);
      tentativas++;
      if (tentativas >= 12) clearInterval(iv);
    }, 500);
  }

  // API pública
  window.CentraTheme = {
    apply: applyTheme,
    toggle: toggleTheme,
    get: function () { return document.documentElement.classList.contains('dark') ? 'dark' : 'light'; },
    // Chamado pelo renderSidebar logo após o innerHTML — garante que o ícone
    // do menu reflita o tema atual mesmo antes do primeiro toggle.
    syncIcon: sincronizarIconeSidebar
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
