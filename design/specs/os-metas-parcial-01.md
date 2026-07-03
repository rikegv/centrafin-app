# OS-METAS-PARCIAL-01 -- Spec de Diff Visual

Arquivo alvo: `dashboard_master_desktop/code.html`
Secao: `#tela-metas` > cards "Status de Atingimento Mensal" (Extrato de Performance Mensal)

---

## Problema / Motivacao

Os cards mensais (Jan-Dez) avaliam atingimento de forma **binaria global**: soma de todos
os produtos >= meta total do mes. Isso esconde situacoes em que ALGUNS produtos bateram a
meta e outros nao. O diretor quer um terceiro estado visual -- **Parcial** -- que reflita
essa realidade intermediaria, com detalhamento por produto no clique.

---

## O que muda

### 1. Novo estado visual "PARCIAL" nos cards mensais (L3880-3933)

A logica de classificacao muda de binaria (atingiu/naoAtingiu) para ternaria por produto.
Para cada mes, iterar os 5 grupos (Consultoria & RPO, Estagio & Fopag, THOMAS, Temporario,
Terceirizados) e contar quantos COM meta bateram vs nao bateram:

| Condicao | Estado | Cor |
|---|---|---|
| TODOS os produtos com meta bateram | Atingida (como hoje) | Verde |
| NENHUM produto com meta bateu | Nao Atingida (como hoje) | Vermelho |
| Pelo menos 1 bateu E pelo menos 1 nao | **Parcial** (NOVO) | **Amber** |
| Meta = 0 (sem meta) | Sem meta (como hoje) | Cinza opaco |
| Futuro/atual sem meta batida | Pendente (como hoje) | Cinza |

#### Tokens visuais do card "Parcial"

| Elemento | Classe | Referencia |
|---|---|---|
| Fundo do card | `bg-amber-50 border-amber-200` | Ja tem dark override em theme.css L189 |
| Hover | `hover:bg-amber-100/50` | Consistente com padrao verde/vermelho |
| Cursor | `cursor-pointer` | Clicavel como os outros dois |
| Icone Material | `remove_done` | Semantica: "parcialmente concluido" |
| Cor do icone | `text-amber-500` | Vibrante, legivel nos dois temas |
| Texto de status | `PARCIAL` | |
| Cor do texto de status | `text-amber-600` | |
| Onclick | `window.abrirModalMetaParcial(idx, anoFiltro)` | Nova funcao (ver item 2) |

Trecho de referencia -- a nova branch no bloco condicional (entre `atingiu` e `!atingiu`):
```
// Pseudo-codigo -- o engenheiro define a implementacao exata
} else if (parcial) {
  cardClass = "bg-amber-50 border-amber-200 hover:bg-amber-100/50 cursor-pointer";
  icon = "remove_done";
  iconColor = "text-amber-500";
  statusTxt = "PARCIAL";
  clickEv = `onclick="window.abrirModalMetaParcial(${idx}, ${anoFiltro})"`;
}
```

A cor do texto de status na linha `<span class="...">` do card (L3929) deve usar
`text-amber-600` para o estado parcial.

### 2. Nova funcao `window.abrirModalMetaParcial(mesIdx, ano)`

Reutiliza o modal existente `#modal-detalhe-meta` (L4477-4501) -- NAO criar modal novo.
Segue exatamente o padrao de `abrirModalMetaNaoAtingida` (L4099-4182) e
`abrirModalMetaBatida` (L4008-4088), mudando apenas a cor e o conteudo misto.

#### Estilo do modal no estado Parcial

| Elemento do modal | Classe/Valor | Referencia |
|---|---|---|
| Barra decorativa topo (`.absolute.top-0`) | Remover `bg-brandGreen`/`bg-red-500`, adicionar `bg-amber-500` | Padrao ja usado pelo vermelho (L4167-4168) |
| Icone no titulo | `remove_done` com `text-amber-500` | |
| Texto do titulo | `"Detalhamento Parcial: {Mes} / {Ano}"` | |

#### Conteudo da lista (misto verde + vermelho)

A lista deve iterar TODOS os 5 produtos que TEM meta > 0 para aquele mes e renderizar:

- **Produto que bateu** (real >= meta): card-item VERDE, identico ao formato de
  `abrirModalMetaBatida` (L4050-4066) -- fundo `bg-green-50`, icone `check` em circulo
  `bg-brandGreen`, texto "Meta Atingida", valor realizado em `text-brandGreen`.

- **Produto que NAO bateu** (real < meta): card-item VERMELHO, identico ao formato de
  `abrirModalMetaNaoAtingida` (L4141-4159) -- fundo `bg-red-50`, icone `trending_down` em
  circulo `bg-red-500`, texto "Faltou R$ X.XXX" em `text-red-600`, percentual abaixo em
  `text-red-400`, Realizado/Meta na coluna direita.

Nenhum layout novo e criado -- os dois formatos de card-item ja existem no codigo.

#### Restauracao de estilo ao fechar

A funcao `fecharModalMetaBatida` (L4090-4097) restaura a barra para `bg-brandGreen`.
Ela precisa agora tambem remover `bg-amber-500` alem de `bg-red-500`. Alteracao minima:
adicionar `barEl.classList.remove('bg-amber-500')` na mesma linha onde ja remove `bg-red-500`.

### 3. Logica JS de classificacao por produto

Os dados necessarios JA existem no codigo:
- `faturamentoPorMesProduto` -- faturamento real por grupo por mes (usado nos gauges).
- `window.dadosMetasGlobais` -- metas por produto/ano/mes.

O engenheiro deve, para cada mes `idx`:
1. Iterar os 5 grupos de produto.
2. Para cada grupo, obter `meta = metaDoc.meses[refMeses[idx]]` e
   `real = faturamentoPorMesProduto[grupo][idx]`.
3. Contar `bateram` (meta > 0 && real >= meta) e `naoBateram` (meta > 0 && real < meta).
4. Se `bateram > 0 && naoBateram > 0` => estado Parcial.
5. Se `bateram > 0 && naoBateram === 0` => estado Atingida (como hoje).
6. Se `naoBateram > 0 && bateram === 0` => estado Nao Atingida (como hoje).

---

## O que fica INTOCADO (delimitar escopo)

1. **Velocimetros/Gauges** (Meta Total Geral e os 5 individuais): NENHUMA mudanca.
   Instrucao explicita do diretor -- velocimetros NAO recebem estado Parcial.
2. **Graficos de barra** (Meta Anual, Meta Anual Bruta): intocados.
3. **Graficos de linha** (Acompanhamento Mensal): intocados.
4. **Cards de estado "Atingida" (verde)**: visual inalterado; logica de QUANDO e verde
   muda (agora exige TODOS os produtos, nao so a soma global).
5. **Cards de estado "Nao Atingida" (vermelho)**: visual inalterado; logica de QUANDO e
   vermelho muda (agora exige NENHUM produto batendo).
6. **Cards "Sem Meta" e "Pendente"**: intocados.
7. **Modal HTML** (`#modal-detalhe-meta` L4477-4501): estrutura HTML intocada; so
   manipulacao JS de classes e conteudo.
8. **Todas as outras telas/secoes do Dashboard Master**: intocadas.
9. **Modulo `metas_desktop/`**: intocado.

---

## Tokens / Cores

| Token/Classe | Uso | Dark override em theme.css |
|---|---|---|
| `bg-amber-50` | Fundo do card Parcial | SIM -- L189: `rgba(245, 158, 11, 0.12)` |
| `border-amber-200` | Borda do card Parcial | NAO existe -- **precisa adicionar** |
| `hover:bg-amber-100/50` | Hover do card | NAO existe -- verificar se funciona sem override (Tailwind gera a classe, dark inverte via opacidade) |
| `text-amber-500` | Cor do icone | Cor vibrante (#f59e0b), legivel no dark sem override |
| `text-amber-600` | Cor do texto "PARCIAL" | Cor vibrante (#d97706), legivel no dark sem override |
| `bg-amber-500` | Barra decorativa do modal | Cor solida, nao precisa de override |
| `bg-green-50` | Card-item verde no modal misto | SIM -- L188 |
| `bg-red-50` | Card-item vermelho no modal misto | SIM -- L187 |

Nenhuma cor hardcoded (hex/rgb) deve ser introduzida no HTML/JS. Todas as cores usam
classes Tailwind que ja tem (ou terao) overrides no theme.css.

---

## Tema escuro

### Ja coberto
- `bg-amber-50` -> theme.css L189.
- `bg-green-50`, `bg-red-50` -> theme.css L187-188.
- `text-amber-500`, `text-amber-600` -> cores vibrantes, contraste OK em fundo escuro.
- `bg-white.rounded-2xl` do modal -> invertido por theme.css L178-179.

### Precisa adicionar em theme.css

```css
html.dark .border-amber-200 { border-color: rgba(245, 158, 11, 0.25) !important; }
```

Seguindo o padrao de `border-rose-100` (L199). Sem isso, `border-amber-200` (#fde68a)
fica quase invisivel em fundo escuro.

### Verificar apos implementacao
- `hover:bg-amber-100/50` no dark: se Tailwind gera a classe com opacidade, a cor
  resultante deve ser visivel mas sutil. Se nao, adicionar override.

---

## Padrao reutilizado de outros modulos

Todo o visual reutiliza padroes JA existentes neste mesmo arquivo:
- Card mensal: mesma estrutura HTML (L3924-3932), so com novas classes de cor.
- Card-item verde no modal: identico a L4050-4066 (`abrirModalMetaBatida`).
- Card-item vermelho no modal: identico a L4141-4159 (`abrirModalMetaNaoAtingida`).
- Manipulacao de barra/titulo do modal: mesmo padrao de L4074-4078 e L4167-4171.

NAO ha necessidade de criar componente novo. Nao buscar padroes em outros modulos.

---

## Riscos

1. **Risco MEDIO -- Mudanca de comportamento em cards existentes**: a logica de
   classificacao muda. Meses que hoje sao "Atingida" (porque a SOMA global batia, mesmo
   com 1 produto abaixo) podem virar "Parcial". Isso e o comportamento DESEJADO, mas o
   testador deve verificar que a reclassificacao e coerente com os dados dos gauges
   individuais.

2. **Risco BAIXO -- border-amber-200 no dark**: precisa do override CSS indicado acima.
   Sem ele, a borda fica invisivel no tema escuro.

3. **Risco BAIXO -- Restauracao do modal ao fechar**: a funcao `fecharModalMetaBatida`
   precisa remover `bg-amber-500` alem de `bg-red-500`. Se esquecer, abrir um card verde
   depois de um parcial deixa a barra amber.

4. **Risco NENHUM -- Performance**: a iteracao por produto para classificar cada mes e
   O(5*12) = 60 operacoes. Desprezivel.

---

## Checklist de auditoria pos-implementacao (para o designer)

- [ ] Toda cor nova usa classe Tailwind, NENHUM hex/rgb hardcoded no HTML/JS.
- [ ] `bg-amber-50` usado no card (nao `bg-yellow-50`, `bg-orange-50` ou outra variante).
- [ ] `border-amber-200` no card com override dark adicionado em theme.css.
- [ ] Icone do card e `remove_done` com cor `text-amber-500`.
- [ ] Texto de status e "PARCIAL" com cor `text-amber-600`.
- [ ] Card parcial e clicavel (`cursor-pointer` + `onclick`).
- [ ] Modal reutiliza `#modal-detalhe-meta` (nao cria modal novo).
- [ ] Barra do modal usa `bg-amber-500` para estado parcial.
- [ ] Lista do modal mostra itens verdes (bateram) E vermelhos (nao bateram).
- [ ] `fecharModalMetaBatida` remove `bg-amber-500` da barra.
- [ ] Velocimetros/gauges NAO foram alterados.
- [ ] Graficos de barra e linha NAO foram alterados.
- [ ] Tema escuro: abrir tela de Metas no dark e verificar card parcial + modal.
- [ ] Rotulos de valor nos cards continuam fixos e visiveis (nao so hover).
