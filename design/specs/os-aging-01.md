# OS-AGING-01 — Spec de Diff Visual: Aging de Notas Vencidas (Dashboard Master)

**Arquivo:** `dashboard_master_desktop/code.html`
**Seção HTML:** linhas 527-558 (container da tabela) + JS `_crRenderTabela` (~linha 1740)

---

## O que MUDA

### 1. Titulo
- DE: `Devedores` (linha 532)
- PARA: `Aging de Notas Vencidas`
- Icone `leaderboard` pode manter ou trocar para `schedule` (decisao do diretor).
- O span `cr-devedores-count` muda seu id para `cr-aging-count` (consistencia semantica).

### 2. Colunas do thead (linha 538-553)
Ordem final (6 colunas, eram 4):

| # | Coluna | Alinhamento | Sortable | ID sugerido |
|---|--------|-------------|----------|-------------|
| 1 | `#` (indice) | left | nao | — |
| 2 | Cliente | left | sim | `cr-th-cliente` (mantido) |
| 3 | Nr NF | left | sim | `cr-th-nf` (NOVO) |
| 4 | Dt Vencto | left | sim | `cr-th-vencto` (NOVO) |
| 5 | Valor Vencido | right | sim | `cr-th-valor` (mantido) |
| 6 | Dias em Atraso | right | sim | `cr-th-dias` (mantido) |

- Colunas novas (Nr NF, Dt Vencto) seguem EXATAMENTE o mesmo padrao de classes dos `<th>` existentes:
  ```
  class="px-6 py-3 font-extrabold cursor-pointer select-none hover:text-brandDarkBlue transition-colors"
  ```
- Nr NF: alinhamento `text-left` (default).
- Dt Vencto: alinhamento `text-left`.

### 3. Granularidade das linhas (JS — `_crRenderTabela`)
- DE: agrupamento por cliente (`devedoresMap`), 1 linha por cliente.
- PARA: 1 linha por nota fiscal (sem agrupamento). Cada item do array filtrado gera uma linha.
- Dados de cada linha:
  - `#`: indice sequencial (como hoje)
  - Cliente: campo `cliente || Cliente || 'Razao Social'` (como hoje)
  - Nr NF: campo `num_nota || numero_nota || 'Nº NF'` (verificar campos do Firestore)
  - Dt Vencto: campo `vencimento || 'Dt Vecto'` formatado DD/MM/AAAA
  - Valor Vencido: `obterFaturamentoReal(data)` formatado com `formatMoedaFull`
  - Dias em Atraso: calculo existente `_crDiasAtraso`

### 4. Classes das celulas novas no tbody (seguir padrao existente)
- Nr NF: `px-6 py-3 text-slate-700 font-bold text-sm` (igual a Cliente)
- Dt Vencto: `px-6 py-3 text-slate-600 text-sm` (tom secundario, data e informativa)

### 5. Estado vazio (linha 1798)
- Colspan: DE `4` PARA `6`.
- Texto: DE `Nenhum devedor no recorte atual.` PARA `Nenhuma nota em atraso no recorte atual.`

### 6. Sort — ampliar `crToggleSort`
- Novas colunas sortable: `nf` (string, case-insensitive) e `vencto` (Date).
- Logica de arrows (spans `cr-arrow-*`) deve cobrir os novos ids.

### 7. Hint do cabecalho
- Texto `Clique no cabecalho p/ ordenar` (linha 534): MANTIDO, sem alteracao.

---

## O que fica INTOCADO

- Container externo: `div.bg-white.rounded-xl.border.border-slate-200.shadow-sm.overflow-hidden` — NAO mexer.
- Scroll: `max-h-[400px] overflow-y-auto custom-scroll` — NAO mexer.
- `<thead>` sticky: classes `bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider sticky top-0 z-10` — MANTIDAS.
- `<tbody>` classe `divide-y divide-slate-100` — MANTIDA.
- Hover de linha: `hover:bg-slate-50 transition-colors` — MANTIDO.
- Cor condicional de "Dias em Atraso": logica `> 30 ? 'text-red-500' : > 15 ? 'text-amber-500' : 'text-slate-600'` — MANTIDA.
- Valor Vencido sempre `text-red-500 font-extrabold` — MANTIDO.
- Cross-filter (empresa, faixa, dia) — continua funcionando, so muda que o resultado nao agrupa por cliente.
- Sem limite de linhas (scroll ja suporta).

---

## Tokens de `theme.css` — aderencia

Todas as classes usadas ja possuem regra de inversao dark em `theme.css`:

| Classe Tailwind | Dark override | Status |
|-----------------|---------------|--------|
| `bg-white` | `var(--bg-card)` | OK (linha 44-45) |
| `border-slate-200` | `var(--border-subtle)` | OK (linha 65-69) |
| `bg-slate-50` (thead) | `var(--bg-card-elev)` | OK (linha 46-54) |
| `text-slate-500` (thead) | `var(--text-secondary)` | OK (linha 97-106) |
| `text-slate-700` (cels) | `var(--text-primary)` | OK (linha 80-94) |
| `text-slate-600` (Dt Vencto) | `var(--text-secondary)` | OK (linha 97-106) |
| `text-slate-400` (indice/#) | `var(--text-muted)` | OK (linha 108-114) |
| `text-red-500` (valor/dias) | Nao remapeado (red-500 e visivel em ambos) | OK |
| `text-amber-500` (dias) | Nao remapeado (amber-500 e visivel em ambos) | OK |
| `divide-slate-100` | `var(--border-divider)` | OK (linha 70) |
| `hover:bg-slate-50` | `var(--bg-card-elev)` | OK via regra de tabela (linha 163) |
| `border-slate-100` (header border) | `var(--border-subtle)` | OK (linha 65) |

**Nenhum hex/rgb hardcoded necessario.** Todas as colunas novas usam classes ja mapeadas.

---

## Padrao equivalente em outros modulos

O modulo `aging_desktop/code.html` (linhas 372-378) possui tabela de notas individuais com colunas Cliente, Valor, Data — mesmo conceito. Porem usa classes ligeiramente diferentes (`py-4 px-2` vs `px-6 py-3`). Como a tabela do Dashboard Master ja tem seu proprio padrao de spacing e o aging_desktop e uma tela dedicada com layout diferente, **manter o padrao do Dashboard Master** (px-6 py-3) para consistencia interna da pagina.

---

## Riscos

1. **Sem risco de quebra de tema escuro** — todas as classes tem cobertura em `theme.css`.
2. **Volume de linhas**: sem agrupamento, a tabela pode ter centenas de linhas. O `max-h-[400px] overflow-y-auto` ja esta presente, entao o scroll nativo cuida disso. Nenhuma paginacao e necessaria neste momento.
3. **Performance**: o `.map()` que gera o innerHTML pode ficar mais pesado com muitas notas. Para o volume atual do CentraFin (controladoria interna), nao e risco. Se escalar, considerar virtualização — mas NAO agora.
4. **Sort expandido**: o objeto `_crSort` precisa aceitar `nf` e `vencto` como valores de `.col`. Garantir que o estado default continue sendo `{ col: 'dias', dir: 'desc' }`.
