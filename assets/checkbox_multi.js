/* ─────────────────────────────────────────────────────────────────────────
   CentraFin — Checkbox Multi-Select (upgrade reutilizável)
   ─────────────────────────────────────────────────────────────────────────
   Pega <select multiple data-checkbox-multi> e troca a UI nativa (que pede
   Ctrl+clique) por um dropdown com checkboxes. Mantém o <select> escondido
   como source-of-truth — todo código existente que faz:
       Array.from(sel.selectedOptions)
       option.selected = true
       Array.from(sel.options)
   continua funcionando sem mudanças.

   Convenções:
   - O option com value="Todos" é tratado como SENTINELA (limpar marca-o
     sozinho; marcar outro item desmarca o sentinela).
   - O atributo opcional `data-placeholder` no <select> define o label do
     trigger quando nada está selecionado. Se ausente, usa o texto do
     option "Todos".
   - Para notificar o upgrader de mudanças externas (setMultiValues etc.),
     dispare `new Event('cb-multi-sync')` no <select>. O upgrader também
     observa childList do <select> (populadores reativos funcionam direto).

   API: window.CentraCheckboxMulti.upgrade(selectEl)
        window.CentraCheckboxMulti.upgradeAll()
   ───────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var SENTINELA = 'Todos';

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function upgrade(sel) {
    if (!sel || sel.tagName !== 'SELECT' || !sel.multiple) return;
    if (sel._cbMultiUpgraded) return;
    sel._cbMultiUpgraded = true;

    var optTodos = sel.querySelector('option[value="' + SENTINELA + '"]');
    var placeholder = sel.dataset.placeholder
      || (optTodos ? optTodos.textContent.trim() : 'Selecionar…');

    // Esconde o <select> nativo mantendo no DOM (source-of-truth).
    sel.style.display = 'none';
    sel.setAttribute('aria-hidden', 'true');
    sel.setAttribute('tabindex', '-1');

    // Wrapper relativo (panel posicionado absolute).
    var wrap = document.createElement('div');
    wrap.className = 'relative cb-multi-wrap';
    wrap.setAttribute('data-cb-multi-for', sel.id || '');
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    // Trigger (botão) — visual coerente com inputs do design system.
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cb-multi-trigger w-full border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm font-medium bg-white text-left flex items-center justify-between hover:border-primary/40 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all shadow-inner';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML =
      '<span data-cb-label class="truncate text-slate-500 flex-1">' + escapeHTML(placeholder) + '</span>' +
      '<span class="material-symbols-outlined text-slate-400 text-[18px] transition-transform shrink-0 ml-2" data-cb-chevron>expand_more</span>';
    wrap.appendChild(trigger);

    // Panel — sai do flow, posicionado abaixo do trigger.
    // Auditoria 2026-05-18 V6 (Item 5): modo "portal" opt-in via data-cb-portal.
    // Quando ativo, o panel usa position:fixed e é posicionado via JS no
    // open — não fica preso por overflow:hidden/auto de ancestrais (caso
    // clássico do modal de Filtros do Contas a Pagar).
    var usePortal = sel.hasAttribute('data-cb-portal');
    var panel = document.createElement('div');
    if (usePortal) {
        panel.className = 'cb-multi-panel hidden fixed z-[200] bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto p-1.5';
        // Em modo portal, o panel é movido pro <body> ao abrir (e devolvido
        // ao wrap ao fechar) — garante escape total de qualquer overflow.
        document.body.appendChild(panel);
    } else {
        panel.className = 'cb-multi-panel hidden absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto p-1.5';
        wrap.appendChild(panel);
    }
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-multiselectable', 'true');

    function getOptionsArr() {
      return Array.from(sel.options);
    }

    function nonSentinelSelected() {
      return getOptionsArr().filter(function (o) {
        return o.selected && o.value !== SENTINELA;
      });
    }

    function updateLabel() {
      var label = trigger.querySelector('[data-cb-label]');
      if (!label) return;
      var marcados = nonSentinelSelected();
      var todosSelecionado = optTodosElement() ? optTodosElement().selected : false;
      if (!marcados.length || todosSelecionado) {
        label.textContent = placeholder;
        label.classList.add('text-slate-500');
        label.classList.remove('text-slate-800', 'font-bold');
      } else if (marcados.length === 1) {
        label.textContent = marcados[0].textContent.trim();
        label.classList.remove('text-slate-500');
        label.classList.add('text-slate-800', 'font-bold');
      } else {
        label.textContent = marcados.length + ' selecionados';
        label.classList.remove('text-slate-500');
        label.classList.add('text-slate-800', 'font-bold');
      }
    }

    function optTodosElement() {
      // Re-busca a cada chamada — o option pode ser recriado pelos populadores.
      return sel.querySelector('option[value="' + SENTINELA + '"]');
    }

    // Estado da busca local — preserva o texto digitado entre re-renders
    // do panel (quando o usuário marca/desmarca uma opção, mantemos o filtro).
    var _busca = '';

    function _matchBusca(opt) {
      if (!_busca) return true;
      // Sentinela "Todos" SEMPRE aparece — operador sempre precisa do botão
      // pra limpar a seleção, mesmo digitando texto no campo de busca.
      if (opt.value === SENTINELA) return true;
      var hay = String(opt.textContent || '').toLowerCase();
      return hay.indexOf(_busca) !== -1;
    }

    function renderPanel() {
      var opts = getOptionsArr();
      if (!opts.length) {
        panel.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-3 px-2">Nenhuma opção disponível.</p>';
        return;
      }
      // Busca aparece quando há > 8 opções não-sentinela — mesmo gatilho que
      // o cliente acordou pra "dropdowns longos" no CP/CRF. Auditoria 2026-05-18 V5.
      var naoSent = opts.filter(function (o) { return o.value !== SENTINELA; });
      var temBusca = naoSent.length > 8;

      var optsFiltradas = opts.filter(_matchBusca);
      var listaHtml = optsFiltradas.map(function (opt) {
        var idx = opts.indexOf(opt); // mantém o índice REAL pro change handler
        var isSent = opt.value === SENTINELA;
        var checked = opt.selected ? 'checked' : '';
        var labelClasses = isSent
          ? 'text-[12px] font-extrabold text-slate-700 border-b border-slate-100 pb-2 mb-1'
          : 'text-[12px] font-semibold text-slate-700';
        var rowExtra = isSent ? 'cb-multi-sent' : '';
        return '' +
          '<label class="cb-multi-row ' + rowExtra + ' flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-primary/5 transition-colors">' +
            '<input type="checkbox" data-cb-idx="' + idx + '" ' + checked +
              ' class="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/30 cursor-pointer shrink-0">' +
            '<span class="' + labelClasses + ' flex-1 truncate" title="' + escapeHTML(opt.textContent.trim()) + '">' +
              escapeHTML(opt.textContent.trim()) +
            '</span>' +
          '</label>';
      }).join('');

      var emptyMsg = '';
      var matchesFiltradas = optsFiltradas.filter(function (o) { return o.value !== SENTINELA; });
      if (_busca && !matchesFiltradas.length) {
        emptyMsg = '<p class="text-xs text-slate-400 italic text-center py-2 px-2">Nenhuma opção bate com "' + escapeHTML(_busca) + '".</p>';
      }

      var buscaHtml = '';
      if (temBusca) {
        // Header sticky com input de busca — não rola junto com a lista.
        // autocomplete=off pra o browser não sugerir bobagens.
        buscaHtml =
          '<div class="cb-multi-busca-wrap sticky top-0 bg-white pb-1.5 mb-1 border-b border-slate-100 z-10">' +
            '<div class="relative">' +
              '<span class="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[14px] pointer-events-none">search</span>' +
              '<input type="text" data-cb-busca placeholder="Buscar…" autocomplete="off" ' +
                'value="' + escapeHTML(_busca) + '" ' +
                'class="w-full pl-7 pr-2 py-1.5 border border-slate-200 rounded-md text-[11px] focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">' +
            '</div>' +
          '</div>';
      }

      panel.innerHTML = buscaHtml + listaHtml + emptyMsg;

      if (temBusca) {
        var inputBusca = panel.querySelector('[data-cb-busca]');
        if (inputBusca) {
          // Foco automático ao abrir só faz sentido se o panel acabou de abrir.
          // Pra evitar roubar foco em re-render por toggle de checkbox, só foca
          // quando o panel está sendo aberto via trigger (gerenciado em outro
          // listener via flag). Por enquanto: foca se não havia foco em nada.
          if (document.activeElement === document.body || document.activeElement === trigger) {
            inputBusca.focus();
          }
          inputBusca.addEventListener('input', function () {
            _busca = String(inputBusca.value || '').toLowerCase().trim();
            renderPanel();
            // Restaura foco no input após o innerHTML — reset selection no fim.
            var nb = panel.querySelector('[data-cb-busca]');
            if (nb) {
              nb.focus();
              var len = nb.value.length;
              try { nb.setSelectionRange(len, len); } catch (_) {}
            }
          });
          // Esc limpa a busca + fecha (UX consistente com inputs nativos).
          inputBusca.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
              if (_busca) { _busca = ''; renderPanel(); }
              else { setPanelOpen(false); }
            }
          });
        }
      }

      panel.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var idx = Number(cb.dataset.cbIdx);
          var opt = sel.options[idx];
          if (!opt) return;
          var todosOpt = optTodosElement();

          if (cb.checked) {
            if (opt.value === SENTINELA) {
              // Sentinela ligada: desmarca tudo mais.
              getOptionsArr().forEach(function (o) {
                o.selected = (o.value === SENTINELA);
              });
            } else {
              opt.selected = true;
              if (todosOpt) todosOpt.selected = false;
            }
          } else {
            opt.selected = false;
            // Se desmarcou TUDO, religa a sentinela para evitar estado vazio.
            var algoMarcado = getOptionsArr().some(function (o) { return o.selected; });
            if (!algoMarcado && todosOpt) todosOpt.selected = true;
          }

          renderPanel();
          updateLabel();
          // Notifica listeners externos (getMultiValues lê o estado atualizado).
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    }

    function _posicionarPortal() {
      // Posiciona o panel imediatamente abaixo do trigger usando coordenadas
      // de viewport (position:fixed). Auditoria 2026-05-18 V6 (Item 5).
      if (!usePortal) return;
      var rect = trigger.getBoundingClientRect();
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var GAP = 4;
      var panelW = rect.width;
      var panelMaxH = 256; // bate com max-h-64 (16rem)
      // Se não couber abaixo, abre acima.
      var espAbaixo = vh - rect.bottom - GAP;
      var espAcima  = rect.top - GAP;
      var abaixo = espAbaixo >= Math.min(panelMaxH, 160) || espAbaixo >= espAcima;
      panel.style.width = panelW + 'px';
      panel.style.left = Math.max(8, Math.min(rect.left, vw - panelW - 8)) + 'px';
      if (abaixo) {
        panel.style.top = (rect.bottom + GAP) + 'px';
        panel.style.maxHeight = Math.min(panelMaxH, espAbaixo - 8) + 'px';
      } else {
        panel.style.top = (Math.max(8, rect.top - GAP - Math.min(panelMaxH, espAcima - 8))) + 'px';
        panel.style.maxHeight = Math.min(panelMaxH, espAcima - 8) + 'px';
      }
    }
    function setPanelOpen(open) {
      panel.classList.toggle('hidden', !open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      var chev = trigger.querySelector('[data-cb-chevron]');
      if (chev) chev.classList.toggle('rotate-180', open);
      if (open && usePortal) _posicionarPortal();
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = panel.classList.contains('hidden');
      // Re-render preguiçoso ao abrir — pega estado eventualmente alterado
      // externamente entre interações.
      if (willOpen) {
        renderPanel();
        updateLabel();
      }
      setPanelOpen(willOpen);
    });

    document.addEventListener('click', function (e) {
      // Quando em portal mode, o panel não está dentro do wrap — precisamos
      // checar AMBOS pra detectar "clique fora" corretamente.
      if (wrap.contains(e.target)) return;
      if (usePortal && panel.contains(e.target)) return;
      setPanelOpen(false);
    });
    // Mantém o panel posicionado durante scroll/resize em modo portal.
    if (usePortal) {
      window.addEventListener('scroll', function () {
        if (!panel.classList.contains('hidden')) _posicionarPortal();
      }, true);
      window.addEventListener('resize', function () {
        if (!panel.classList.contains('hidden')) _posicionarPortal();
      });
    }

    // Re-render quando o <select> é re-populado (populadores reativos).
    var moOpts = new MutationObserver(function () {
      renderPanel();
      updateLabel();
    });
    moOpts.observe(sel, { childList: true });

    // Sync explícito disparado pelo código consumidor (setMultiValues etc.).
    sel.addEventListener('cb-multi-sync', function () {
      renderPanel();
      updateLabel();
    });

    renderPanel();
    updateLabel();
  }

  function upgradeAll(scope) {
    var root = scope || document;
    root.querySelectorAll('select[multiple][data-checkbox-multi]').forEach(upgrade);
  }

  window.CentraCheckboxMulti = { upgrade: upgrade, upgradeAll: upgradeAll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { upgradeAll(); });
  } else {
    upgradeAll();
  }
})();
