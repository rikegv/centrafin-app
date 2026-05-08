/* ─────────────────────────────────────────────────────────────────────────
   Centra Fin — Theme Manager (global)
   - Lê/escreve `localStorage('centrafin-theme')` (valores: 'light' | 'dark').
   - Se o HTML já declarar um <button id="theme-toggle"> (ex.: CRF, Master),
     apenas o conecta. Caso contrário, auto-monta um toggle flutuante.
   - Atualiza ApexCharts (mode + tooltip) quando os charts existem.

   IMPORTANTE: o boot que aplica a classe em <html> precisa rodar ANTES do
   paint, então fica inline no <head> de cada página. Este arquivo é o
   wire-up + auto-mount, carregado com `defer`.
   ───────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var STORAGE_KEY = 'centrafin-theme';

  function getSavedTheme() {
    try { return localStorage.getItem(STORAGE_KEY) || 'light'; }
    catch (e) { return 'light'; }
  }

  function applyTheme(modo) {
    var html = document.documentElement;
    html.classList.remove('light', 'dark');
    html.classList.add(modo === 'dark' ? 'dark' : 'light');
    try { localStorage.setItem(STORAGE_KEY, modo === 'dark' ? 'dark' : 'light'); } catch (e) {}
    aplicarThemeCharts(modo === 'dark' ? 'dark' : 'light');
  }

  function toggleTheme() {
    var atual = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    applyTheme(atual === 'dark' ? 'light' : 'dark');
  }

  // Sincroniza ApexCharts globais (Master) — opcional; se a página não usar Apex, é no-op.
  function aplicarThemeCharts(modo) {
    if (typeof ApexCharts === 'undefined') return;
    var keysGlobais = [
      'chartBrutoGlobal', 'chartRealGlobal', 'chartEmpresaGlobal', 'chartServicoGlobal',
      'chartComercialGlobal', 'chartThomasBrutoGlobal', 'chartThomasRealGlobal',
      'chartThomasServicoGlobal', 'chartThomasComercialGlobal',
      'chartEmissoes30Dias', 'chartEmissoesAno',
      'chartMetaAnualFat', 'chartMetasMensal'
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

  // Cria o markup do toggle (button + ícones de sol/lua).
  // O <button id="theme-toggle"> sozinho já é estilizado pelo theme.css.
  // O wrapper agrupa os ícones decorativos ao redor.
  function buildToggleNode(useFloatingWrapper) {
    var wrapper = document.createElement('div');
    if (useFloatingWrapper) wrapper.id = 'theme-toggle-floating';
    else { wrapper.style.display = 'flex'; wrapper.style.alignItems = 'center'; wrapper.style.gap = '10px'; }
    wrapper.title = 'Alternar tema claro/escuro';

    var sun = document.createElement('span');
    sun.className = 'material-symbols-outlined';
    sun.textContent = 'light_mode';

    var moon = document.createElement('span');
    moon.className = 'material-symbols-outlined';
    moon.textContent = 'dark_mode';

    var btn = document.createElement('button');
    btn.id = 'theme-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Alternar tema claro/escuro');

    wrapper.appendChild(sun);
    wrapper.appendChild(btn);
    wrapper.appendChild(moon);
    return wrapper;
  }

  // Auto-mount: se a página NÃO definiu um #theme-toggle, monta um.
  // Estratégia: tenta inserir no primeiro <header>; senão, usa flutuante fixo.
  function autoMount() {
    if (document.getElementById('theme-toggle')) return; // já existe (CRF/Master)
    var header = document.querySelector('header');
    if (header) {
      var node = buildToggleNode(false);
      // Se o header for flex, garante alinhamento à direita.
      var style = window.getComputedStyle(header);
      if (style.display === 'flex') {
        node.style.marginLeft = 'auto';
      }
      header.appendChild(node);
    } else {
      // Fallback: pill flutuante fixo no canto superior direito.
      document.body.appendChild(buildToggleNode(true));
    }
  }

  function wireToggle() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    if (btn._centraThemeWired) return; // idempotente
    btn._centraThemeWired = true;
    btn.addEventListener('click', toggleTheme);
  }

  function init() {
    autoMount();
    wireToggle();

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
    get: function () { return document.documentElement.classList.contains('dark') ? 'dark' : 'light'; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
