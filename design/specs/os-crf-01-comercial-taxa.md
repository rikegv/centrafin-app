# OS-CRF-01 — Colunas Comercial e Taxa no Gerenciador CRF

## Arquivo afetado
`contas_a_receber_desktop/code.html`

---

## 1. Ordem de colunas — ANTES vs DEPOIS

### ANTES (thead linhas 348-447)
| # | Coluna           | Alinhamento th | sort key        |
|---|------------------|---------------|-----------------|
| 0 | (checkbox)       | center        | -               |
| 1 | Empresa          | text-left     | empresa         |
| 2 | RPS              | text-left     | rps             |
| 3 | Tipo de Servico  | text-left     | servico         |
| 4 | N. NF-e          | text-left     | nfe             |
| 5 | Cliente          | text-left     | cliente         |
| 6 | Cod. Cliente     | text-left     | cod_cliente     |
| 7 | CNPJ             | text-left     | cnpj            |
| 8 | Mes Ref.         | text-left     | mes_ref         |
| 9 | Emissao          | text-left     | emissao         |
|10 | Vencimento       | text-left     | vencimento      |
|11 | Data da Baixa    | text-left     | baixa           |
|12 | Faturamento Bruto| text-right    | valor_fatura    |
|13 | Valor Liquido    | text-right    | valor_liquido   |
|14 | Fat. Real        | text-right    | fat_real        |
|15 | Status           | text-center   | status          |
|16 | Acoes            | text-right    | -               |

### DEPOIS
| # | Coluna            | Alinhamento th   | sort key         | Novo? |
|---|-------------------|-----------------|------------------|-------|
| 0 | (checkbox)        | center          | -                | nao   |
| 1 | Empresa           | **text-center** | empresa          | nao (centralizar) |
| 2 | **Comercial**     | **text-center** | comercial        | **SIM** |
| 3 | RPS               | **text-center** | rps              | nao (centralizar) |
| 4 | Tipo de Servico   | **text-center** | servico          | nao (centralizar) |
| 5 | N. NF-e           | **text-center** | nfe              | nao (centralizar) |
| 6 | Cliente           | **text-center** | cliente          | nao (centralizar) |
| 7 | Cod. Cliente      | **text-center** | cod_cliente      | nao (centralizar) |
| 8 | CNPJ              | **text-center** | cnpj             | nao (centralizar) |
| 9 | Mes Ref.          | **text-center** | mes_ref          | nao (centralizar) |
|10 | Emissao           | **text-center** | emissao          | nao (centralizar) |
|11 | Vencimento        | **text-center** | vencimento       | nao (centralizar) |
|12 | Data da Baixa     | **text-center** | baixa            | nao (centralizar) |
|13 | Faturamento Bruto | **text-center** | valor_fatura     | nao (centralizar) |
|14 | **Taxa**          | **text-center** | taxa             | **SIM** |
|15 | Valor Liquido     | **text-center** | valor_liquido    | nao (centralizar) |
|16 | Fat. Real         | **text-center** | fat_real         | nao (centralizar) |
|17 | Status            | **text-center** | status           | nao (ja center) |
|18 | Acoes             | **text-center** | -                | nao (centralizar) |

---

## 2. O que fica INTOCADO
- KPIs do topo (cards/metricas) — nao tocar.
- Modal de exportacao — nao tocar.
- Modal de parcelamento — nao tocar.
- Modal de duplicatas — nao tocar.
- Modal de auditoria — nao tocar.
- Modal de importacao — nao tocar.
- Logica de calculo de valores (formatadorMoeda, vFaturaDisp, vLiquidoDisp, faturRealDisp).
- CSS de `theme.css` — nenhum token novo.
- Estilos inline de `<style>` na pagina (linhas 84-140) — nao tocar.

---

## 3. Tokens CSS e classes a usar (nenhum novo)

### thead — th novos (Comercial, Taxa)
Copiar exatamente o padrao dos th existentes (linha 356 como modelo):
```
class="px-4 py-4 text-center font-bold text-on-surface-variant uppercase tracking-widest
       border-r border-slate-200 shadow-[1px_0_0_rgba(0,0,0,0.03)]
       cursor-pointer hover:bg-slate-50 transition-colors group select-none"
```
- Icone de sort: `<span class="material-symbols-outlined text-[16px] text-slate-300 group-hover:text-brandMidBlue transition-colors" id="icone-sort-comercial">unfold_more</span>`
- Idem para `id="icone-sort-taxa"`.

### Centralizacao de TODOS os th
- Trocar `text-left` por `text-center` em cada th existente.
- Trocar `text-right` por `text-center` nos th de valores (Faturamento Bruto, Valor Liquido, Fat. Real).
- O `<div class="flex items-center gap-1">` interno dos th com sort tambem precisa de `justify-center`.
- Os th de valores que tinham `justify-end` passam para `justify-center`.

**Importante:** a centralizacao e APENAS nos th (cabecalhos). Os td do tbody mantem seus alinhamentos atuais (text-right para valores monetarios e text-left/center para os demais). Isso preserva legibilidade financeira.

### tbody — td novos
Usar a variavel `cellClass` ja definida (linha 3056):
```js
const cellClass = "px-4 py-3 text-[10px] text-on-surface-variant font-medium border-r border-slate-100 last:border-r-0 shadow-[1px_0_0_rgba(0,0,0,0.02)]";
```

- **td Comercial:** `<td class="${cellClass}">${comercialLimpo}</td>` — texto simples, sem estilo especial.
- **td Taxa:** `<td class="${cellClass} text-right">${formatadorMoeda.format(taxa)}</td>` — alinhado a direita como os demais valores monetarios (Faturamento Bruto, Valor Liquido).

### Dark mode
Nenhum risco. Todos os tokens usados (`text-on-surface-variant`, `border-slate-200`, `border-slate-100`, `bg-slate-50`) ja tem inversao em `theme.css` (linhas 57-58, 65-69, 161-164). Nada hardcoded novo.

---

## 4. Colspan do empty-state
Linha 3000 tem `colspan="17"`. Com duas colunas novas, atualizar para `colspan="19"`.

---

## 5. Logica de exibicao dos dados novos

### Comercial
- Fonte: `d['Comissionado 01']` (campo do Firestore).
- Exibicao: stripar prefixo numerico do tipo `"006 - "` (regex `/^\d+\s*-\s*/`), exibir so o nome.
- Se vazio/nulo: exibir `"-"`.

### Taxa
- Fonte: `d['Taxa Administrativa']` ou campo equivalente do Firestore (confirmar nome exato do campo com o engenheiro-backend).
- Exibicao: `formatadorMoeda.format(taxa)` — mesmo formatador dos demais valores.
- Se vazio/nulo: exibir `R$ 0,00` ou `"-"` (definir com o diretor; recomendo `"-"` para distinguir de taxa zero real).

---

## 6. Filtro avancado — Comercial

### Padrao a seguir
Seguir exatamente o padrao dos filtros multi-select existentes (linhas 807-845):
- `<label class="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Comercial</label>`
- `<select id="filtro-comercial" multiple size="6" data-checkbox-multi data-placeholder="Todos os Comerciais" class="w-full border border-slate-200 rounded-lg py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all shadow-inner">`
- Opcao default: `<option value="Todos" selected class="font-bold border-b pb-1 mb-1">Todos os Comerciais</option>`
- Demais opcoes: populadas dinamicamente a partir dos dados carregados (como os valores unicos de `Comissionado 01`, ja com nome limpo).

### Posicao no modal
Adicionar na coluna esquerda do grid (div `space-y-5`, linhas 806-846), APOS o filtro de Empresa — fica como quarto bloco nessa coluna.

### Logica de filtragem
Na funcao de filtragem existente (provavelmente onde `fTipoArr` e `fStatusArr` sao lidos), adicionar leitura de `filtro-comercial` e filtrar `d['Comissionado 01']` de forma analoga.

---

## 7. Modal de edicao — campo Comercial

### Padrao a seguir
Seguir o padrao dos campos de texto do formulario `form-receita` (linhas 661-735):
```html
<div class="col-span-1">
  <label class="block text-xs font-bold text-slate-700 mb-1">Comercial</label>
  <input type="text" id="campo-comercial"
    class="w-full border border-slate-200 rounded-lg py-2 px-3 text-sm
           focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
    placeholder="Nome do Comercial">
</div>
```

### Posicao no formulario
Inserir apos o campo "Cliente" (linha 674), no grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`.

### Persistencia
Na funcao de salvar, gravar o valor em `Comissionado 01` no Firestore. Na funcao `abrirEdicao`, popular o campo a partir de `d['Comissionado 01']`.

---

## 8. Riscos e observacoes

1. **Largura da tabela:** com 19 colunas (era 17), a tabela ficara mais larga. O container ja tem `overflow-x-auto` (confirmar), entao scroll horizontal e esperado. Nao e problema.
2. **Tema escuro:** sem risco — nenhum token novo, todos os usados ja tem par claro/escuro em `theme.css`.
3. **Responsividade:** a tabela ja nao e responsiva (e um gerenciador desktop). Sem impacto.
4. **Sort:** o engenheiro precisa adicionar os cases `'comercial'` e `'taxa'` na funcao `ordenarTabelaCRF`.
5. **Exportacao:** se a exportacao monta colunas a partir dos dados, Comercial e Taxa devem entrar automaticamente. Se monta a partir de um array fixo de colunas, o engenheiro precisa adicionar la tambem — verificar.
