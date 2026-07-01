# OS-FECHAMENTO-01 -- Matrizes Comercial x Servico no Fechamento

> Spec de diff visual para o engenheiro-frontend.
> Arquivo afetado: `dashboard_master_desktop/code.html`, secao `div#visao-fechamento` (linhas ~787-882).

---

## LAYOUT ANTES (estado atual)

### Soulan (2 tabelas)
1. **"Faturamento Real (Soulan) . por Comercial"** -- matriz linhas=comerciais, colunas=servicos, tbody id=`tbody-fech-soulan-bruto`. Header fixo `bg-[#002443]`. NOTA: apesar do label dizer "Real", o tbody se chama `-bruto` e o `renderTable` e chamado com tipo `'bruto'`; porem o pivot `.bruto` ja soma `faturReal` (comentario linhas 2564-2567 confirma).
2. **"Faturamento Real (Soulan) . por Servico"** -- transposta, table id=`tabela-fech-soulan-servico`, tbody id=`tbody-fech-soulan-real`. Renderizada por `renderTabelaPorServico(pivotSoulan, colsSoulan, 'real', false)`.

### Thomas (2 tabelas)
1. **"Faturamento Real (Thomas) . por Comercial"** -- matriz, tbody id=`tbody-fech-thomas-bruto`. Header fixo `bg-[#434f55]`.
2. **"Faturamento Real (Thomas) . por Servico"** -- transposta, table id=`tabela-fech-thomas-servico`, tbody id=`tbody-fech-thomas-real`.

---

## LAYOUT DEPOIS (o que muda)

### Soulan -- de 2 tabelas para 2 tabelas (substituicao)
1. **"Faturamento Bruto (Soulan) . por Comercial"** -- CRIAR (nova). Metrica = soma de `vFatura` (campo `valor_fatura`). Mesma estrutura de matriz existente.
2. **"Faturamento Real (Soulan) . por Comercial"** -- JA EXISTE (e a tabela 1 atual). Manter. Corrigir label de `<h3>` se necessario para deixar claro que e "Real".
3. **"por Servico" transposta** -- REMOVER. Apagar o bloco HTML inteiro (linhas ~820-832) e a chamada JS `renderTabelaPorServico(pivotSoulan, ...)` (linha ~3005).

### Thomas -- de 2 tabelas para 3 tabelas (substituicao + adicao)
1. **"Faturamento Bruto (Thomas) . por Comercial"** -- CRIAR (nova).
2. **"Faturamento Real (Thomas) . por Comercial"** -- JA EXISTE. Manter.
3. **"Faturamento por Taxa (Thomas) . por Comercial"** -- CRIAR (nova). Metrica = soma de `vTaxa` por comercial x servico. Precisa de um terceiro sub-dict no pivot (`taxa: {...}`), analogo a `bruto`/`real`.
4. **"por Servico" transposta** -- REMOVER. Apagar bloco HTML (linhas ~869-878) e chamada JS (linha ~3006).

---

## O QUE FICA INTOCADO

- Toda a secao ACIMA de `div#visao-fechamento` (KPIs de fechamento, graficos, filtros).
- Secoes de Metas, Fluxo, RH -- intocadas.
- Funcao `renderTabelaPorServico` -- pode ser REMOVIDA inteira (linhas ~2934-2993) pois nenhuma tabela transposta sobrevive. Ou manter como dead code se preferir seguranca -- decisao do engenheiro.
- Funcao `renderTable(pivotDict, cols, tipo)` -- REUSAR sem alteracao. Ja aceita `tipo` como parametro, entao basta chamar com `'bruto'`, `'real'`, ou `'taxa'`.
- Arrays `colsSoulan` e `colsThomas` (linha ~2921-2922) -- intocados.
- Objeto `labelsServicos` (linhas ~2923-2928) -- intocado.

---

## DADOS / PIVOT -- o que o engenheiro precisa mudar no JS

### Estado atual do pivot (PROBLEMA)
O pivot atual tem `.bruto` e `.real`, mas AMBOS somam `faturReal` (linhas 2567-2570 e 2593-2596). Os comentarios nas linhas 2564-2565 confirmam: "O campo `.bruto` foi convertido para somar faturReal".

### O que corrigir
1. **`.bruto` deve voltar a somar `vFatura`** (valor bruto da nota). Trocar `faturReal` por `vFatura` nas linhas que alimentam `.bruto` (Soulan: ~2567/2569; Thomas: ~2593/2595).
2. **`.real` permanece somando `faturReal`** -- sem mudanca.
3. **Thomas ganha `.taxa`** -- criar terceiro sub-dict no pivot Thomas (mesmo shape que `.bruto`/`.real`), somando `vTaxa`. Nao se aplica a Soulan.

### Chamadas de renderizacao (linhas ~2996-3006)
ANTES:
```
tbodySoulanBruto.innerHTML = renderTable(pivotSoulan, colsSoulan, 'bruto');  // exibia Real rotulado como Bruto
tabelaSoulanServico.innerHTML = renderTabelaPorServico(...);
tbodyThomasBruto.innerHTML = renderTable(pivotThomas, colsThomas, 'bruto');
tabelaThomasServico.innerHTML = renderTabelaPorServico(...);
```

DEPOIS:
```
tbodySoulanBruto.innerHTML  = renderTable(pivotSoulan, colsSoulan, 'bruto');  // agora de fato Bruto
tbodySoulanReal.innerHTML   = renderTable(pivotSoulan, colsSoulan, 'real');   // Real (novo tbody)
tbodyThomasBruto.innerHTML  = renderTable(pivotThomas, colsThomas, 'bruto');
tbodyThomasReal.innerHTML   = renderTable(pivotThomas, colsThomas, 'real');
tbodyThomasTaxa.innerHTML   = renderTable(pivotThomas, colsThomas, 'taxa');  // novo
```
(remover as duas chamadas de `renderTabelaPorServico`)

---

## IDS HTML -- mapeamento

| Tabela | ID do tbody | Acao |
|--------|-------------|------|
| Soulan Bruto por Comercial | `tbody-fech-soulan-bruto` | REUSAR (ja existe, linha 815) |
| Soulan Real por Comercial | `tbody-fech-soulan-real` | REUSAR id (ja existe, linha 829, era usado na transposta -- agora tera nova table wrapper) |
| Thomas Bruto por Comercial | `tbody-fech-thomas-bruto` | REUSAR (ja existe, linha 864) |
| Thomas Real por Comercial | `tbody-fech-thomas-real` | REUSAR id (ja existe, linha 876, era usado na transposta) |
| Thomas Taxa por Comercial | `tbody-fech-thomas-taxa` | CRIAR (novo) |
| Soulan Servico transposta | `tabela-fech-soulan-servico` | REMOVER (table + wrapper div inteiro) |
| Thomas Servico transposta | `tabela-fech-thomas-servico` | REMOVER (table + wrapper div inteiro) |

---

## TOKENS / ESTILOS VISUAIS

### Cores de cabecalho (thead)
| Empresa | Cor | Status em theme.css | Orientacao |
|---------|-----|---------------------|------------|
| Soulan | `#002443` | **Hardcoded** (Tailwind arbitrary `bg-[#002443]`). Tema escuro coberto por `html.dark .text-[#002443]` (linha 219 de theme.css). Classe `bg-brandDarkBlue` NAO e equivalente (brandDarkBlue = cor Tailwind config, nao necessariamente `#002443`). | Manter `bg-[#002443]` -- e o padrao estabelecido no Fechamento. |
| Thomas | `#434f55` | **Hardcoded** (Tailwind arbitrary `bg-[#434f55]`). Tema escuro coberto por `html.dark .text-[#434f55]` (linha 222). | Manter `bg-[#434f55]`. |

### Coluna Total Geral (thead)
| Empresa | Fundo | Texto | Origem |
|---------|-------|-------|--------|
| Soulan | `bg-[#003459]` | `text-brandGreen` | Hardcoded fundo; token Tailwind para texto. Manter. |
| Thomas | `bg-[#ff5f15]` | `text-[#ffefe8]` | Ambos hardcoded. Manter. |

### Rodape TOTAL GERAL (ultima linha sticky)
| Empresa | Footer bg | Footer text | Cell bg Total |
|---------|-----------|-------------|---------------|
| Soulan | `bg-brandGreen/10` | `text-brandDarkBlue` | `bg-[#f0f9d9]` / `bg-brandGreen/20` |
| Thomas | `bg-[#ff5f15]` | `text-[#ffefe8]` | `bg-[#ff5f15]` |
Manter tudo -- renderTable ja aplica via deteccao `isThomas` (verifica se `cols.includes("DEVOLUTIVA")`).

### Celulas de dados
- Texto: `text-[11px]`, `text-right`, `whitespace-nowrap`.
- Valores: formatados por `window.formatMoedaFull(v)`.
- Coluna label (comercial): `bg-slate-200`, `font-extrabold`, `text-brandDarkBlue`, sticky left.
- Fonte monoespocada: **ALERTA** -- a regra permanente CentraFin exige fonte mono para numeros financeiros, mas o `renderTable` atual usa classes Tailwind padrao (sem `font-mono`). O engenheiro deve verificar se `formatMoedaFull` ja insere algum wrapper mono ou se a tabela herda de um container. Se nao, adicionar `font-mono` nas celulas numericas e a spec recomenda -- mas isso e correcao pre-existente, nao regressao desta OS.

### Containers das tabelas
- Wrapper: `overflow-x-auto max-h-[500px] overflow-y-auto custom-scroll rounded-xl border border-slate-200 shadow-sm`.
- Cada nova tabela (Soulan Real, Thomas Taxa) precisa de um wrapper identico.

### Subtitulos (h3)
- Classes: `text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3 ml-1`.
- Labels exatos para cada nova tabela:
  - "Faturamento Bruto (Soulan) . por Comercial"
  - "Faturamento Real (Soulan) . por Comercial"
  - "Faturamento Bruto (Thomas) . por Comercial"
  - "Faturamento Real (Thomas) . por Comercial"
  - "Faturamento por Taxa (Thomas) . por Comercial"

---

## RISCOS

1. **Tema escuro**: as cores hardcoded `#002443`, `#434f55`, `#ff5f15`, `#003459`, `#f0f9d9`, `#ffefe8` ja possuem overrides em `theme.css` (linhas 55-58, 219, 222) para dark mode. Como estamos REUSANDO a mesma funcao `renderTable` com as mesmas classes, nao ha risco novo. O engenheiro deve garantir que as novas tables usem exatamente as mesmas classes do thead existente.

2. **Responsividade**: container com `overflow-x-auto` ja cuida de scroll horizontal. Nenhuma mudanca necessaria. Ao passar de 2 para 2 tabelas (Soulan) e de 2 para 3 (Thomas), o scroll vertical da pagina aumenta -- aceitavel.

3. **Dados pivot `.bruto` revertendo para `vFatura`**: essa correcao pode causar divergencia numerica visivel entre "Bruto" e "Real" (hoje sao identicos pois ambos somam `faturReal`). Isso e o ESPERADO e e exatamente o objetivo da OS. O diretor deve validar os numeros na tela.

4. **Campo `vTaxa` pode ser zero/nulo em notas Soulan**: a tabela de Taxa e so Thomas. Garantir que o pivot Thomas.taxa so seja alimentado no bloco `else if (empresa === "NEAT")`.

---

## PADRAO REUTILIZADO

- Funcao `renderTable` (linha 2878) -- reusar sem alteracao.
- Estrutura HTML de `<table>` com `<thead>` fixo e `<tbody>` dinamico -- copiar do bloco Soulan Bruto existente (linhas 798-817) para cada nova tabela, trocando apenas id do tbody e label do h3.
- Para Thomas, copiar do bloco Thomas Bruto existente (linhas 847-866).
- As colunas do thead sao FIXAS (nao dinamicas) -- copiar literalmente do thead existente de cada empresa.
