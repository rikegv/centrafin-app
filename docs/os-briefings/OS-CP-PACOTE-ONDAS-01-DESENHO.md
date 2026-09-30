# OS-CP-PACOTE-ONDAS-01, DESENHO DA FASE 1

> Fase 1 concluida em 2026-09-29. Nada foi construido: zero branch, zero edicao de tela, zero
> escrita na base. Este documento e o desenho que o DIRETOR aprova antes da implementacao.
>
> Producao: dois arquitetos (leitura, sem escrita), um para as Frentes 1, 2 e 3, outro para a
> Frente 4. Coordenador mediu a base real, CONFERIU cada afirmacao dos dois e consolidou aqui.
>
> Medicao read-only: `scripts/medir-pacote-ondas.cjs` e `scripts/medir-mojibake-categoria.cjs`.
> Credencial temporaria montada do token do firebase CLI e apagada nas duas rodadas.

---

## 0. O QUE A MEDICAO DA BASE REAL DISSE

Volumetria: `ContasAPagar` 51.181 · `Fornecedores` 841 · `AreasContasPagar` 14 ·
`Base_Empresas` 5 · `CP_Base_Despesas` 112.

### 0.1. tipo_entidade no lancamento

| tipo | docs | % | valor 2026, tarifa expurgada |
|---|---|---|---|
| Cliente | 44.798 | 87,5% | R$ 25.474.325,89 |
| Fornecedor Externo | 2.315 | 4,5% | R$ 16.088.181,69 |
| (VAZIO/NULL) | 1.932 | 3,8% | R$ 1.551.255,96 |
| Fornecedor Interno | 1.557 | 3,0% | R$ 2.461.223,03 |
| Fornecedor Interno - PJ | 579 | 1,1% | R$ 3.166.730,36 |
| tarifa/comissao expurgada | 601 | | R$ 152.170,13 |

Nao existe nenhum lancamento com o rotulo variante `Fornecedor Interno (PJ)`. A inconsistencia de
rotulo registrada no MAPA existe so na UI do `master.html`, nao no dado.

### 0.2. Centro de custo e gestor

13 CCs distintos no lancamento, 14 areas cadastradas. 49.984 docs ja acham gestor hoje.
**0 docs ganham gestor com normalizacao.** 83 docs sem area nem normalizada. 1.114 com CC vazio.

### 0.3. Empresa

`Base_Empresas`, os 5 docs, campo por campo:

| docId | campos |
|---|---|
| `2mJi5gyTqM9gnuVCvORM` | `nome_fantasia: "RAFUL"` |
| `NEAT` | `nome: "NEAT"` |
| `SOULAN ADM` | `nome: "SOULAN ADM"` |
| `SOULAN CONS` | `nome: "SOULAN CONS"`, `nome_fantasia: "SOULAN CONSULTORIA"` |
| `wX0rXS1gcVOLFlHj1ilt` | `nome_fantasia: "SOULAN CONSULTORIA 3"` |

Lancamentos: 329 com `empresa` GRAVADA, 44.586 que HERDAM do fornecedor, **6.266 sem empresa por
nenhum caminho**.

`Fornecedores.empresa`, 18 valores distintos, e a maioria e lixo: 610 `SOULAN CONSULTORIA`,
127 VAZIO, 66 `SOULAN ADM`, 15 `NEAT`, 9 `NEAT SOLUCOES E TECNOLOGIA RH LTDA`, 1 `SOULAN CONSULORIA`
(erro de digitacao), e 12 valores que sao NOME DE FORNECEDOR colado no campo empresa
(`TOP ARABE RESTAURANTE LTDA`, `LIBBS FARMACEUTICA LTDA`, `BUNGE ALIMENTOS S/A`, e outros).

### 0.4. A ancora da Onda 4

104 valores distintos de `categoria`, 0 docs sem categoria. Cruzando com `CP_Base_Despesas`:
casam **14.155 docs (27,7%)**, nao casam **37.026 (72,3%)**, porque o ERP trunca em 30 caracteres.

**`ContasAPagar.categoria`: ZERO mojibake e ZERO U+FFFD nos 104 valores distintos.** A ancora
esta limpa. `CP_Base_Despesas`: 40 dos 112 docs com mojibake Ã/Â, 0 com U+FFFD.

---

## 1. O QUE O COORDENADOR CONFERIU, E AS DUAS CORRECOES

Conferi no codigo cada afirmacao dos arquitetos que muda decisao. Confirmadas:

| afirmacao | veredito |
|---|---|
| `gerenciador_contas_pagar_desktop/code.html` NAO carrega `core_rules.js` | CONFIRMADO, zero ocorrencias no arquivo |
| `_cpChaveFiltro` existe em `:1996` e ja normaliza `centro_custo` no filtro (`:2495`), enquanto o lookup de gestor usa `.trim()` puro (`:2589`, `:2715`, `:5603`) | CONFIRMADO, sao DUAS reguas no mesmo campo |
| Nao existe card "Vencidos" no DOM; `setKPI('kpi-vencido')` escreve em elemento inexistente | CONFIRMADO |
| `MAP_CLASS_FILTRO['OPEX']` (`:2384`) tambem exclui PJ, igual ao KPI de `:2788` | CONFIRMADO, o buraco do PJ esta em dois lugares |
| `normalizarEmpresa` do DRE (`:303-311`) colapsa qualquer rotulo com SOULAN no mesmo balde | CONFIRMADO, e isso derruba a maior parte do risco do DRE |
| O diretor JA decidiu contra `CP_Base_Despesas` em 2026-09-04 (`DIARIO.md:877-881`, fonte "inadequada") | CONFIRMADO |
| `reg.empresa` e mutado em memoria (`:1742`, `:1770`) e vaza para producao via clone de recorrencia (`:5746` faz `...reg`, `:5766` faz `batch.set`) | CONFIRMADO lendo o codigo. Os dois arquitetos acharam isso de forma independente |

### CORRECAO 1, contra o Arquiteto A

O achado dele de que o fallback `d.id` de `_cpEmpresasOficiais` (`:3044`) "ja vaza ID cru do
Firestore para a UI" **esta errado no efeito**. Os dois docs sem `nome` TEM `nome_fantasia`
(`RAFUL` e `SOULAN CONSULTORIA 3`), e `:3044` le `nome_fantasia` PRIMEIRO. Nenhum ID chega a tela.

O problema real e outro, e e pior: o catalogo oferece **5 opcoes, duas suspeitas**. `RAFUL` e
`SOULAN CONSULTORIA 3` nao parecem empresas alocaveis do grupo, e `SOULAN CONS` aparece na tela
como `SOULAN CONSULTORIA` enquanto um doc SEPARADO tambem diz `SOULAN CONSULTORIA 3`. Isso nao se
resolve com filtro de leitura: exige o diretor dizer quais sao as empresas de verdade (Q4).

### CORRECAO 2, a favor do Arquiteto B, desbloqueando a Onda 4

Ele pediu, como pre-requisito, a medicao de mojibake em `ContasAPagar.categoria`, que nunca havia
sido feita, e avisou que o numero "40 de 112" da rodada 1 era suspeito porque meu regex tinha sido
corrompido na escrita do arquivo. Estava certo nas duas coisas. Corrigi o padrao (escapes `\u`,
assinatura `[ÃÂ][-¿]`) e remedi:

- `ContasAPagar.categoria`: **zero corrupcao**, nos dois tipos. O desenho dele segue sem pre-requisito.
- `CP_Base_Despesas`: 40 de 112, o mesmo numero. O metodo estava furado, o numero estava certo.

---

## 2. FRENTE 1, CASO CATARINA

**A causa registrada na OS esta FALSIFICADA pelos dados.** Nao e lookup sensivel a caixa, acento ou
espaco: os 83 lancamentos tem `centro_custo = "COMERCIAL"` e **nao existe area com esse nome**.
Existem tres: `COMERCIAL THOMAS` (Rejane Matos), `COMERCIAL TEAM TAILOR` (Rejane Matos),
`COMERCIAL SOULAN` (Marcelo Medeiros). Os outros 10 lancamentos da Catarina usam `COMERCIAL SOULAN`
e ja mostram o gestor certo hoje.

Nao e achado novo: o `DIARIO.md:884` de 2026-09-04 ja registrava que "COMERCIAL existe so nos
lancamentos". A tela tambem ja sinaliza, injetando a opcao fantasma `COMERCIAL (nao cadastrado)` ao
abrir a edicao de um desses docs (`:5690-5697`).

### 2.1. A normalizacao entrega ZERO hoje, e ainda assim vale

Funcao: **reusar `_cpChaveFiltro` (`:1996`), que ja existe**, e NAO mover nada para `core_rules.js`,
porque o CP nao carrega esse arquivo e inserir a tag `<script>` reabriria o incidente de
ReferenceError em producao registrado na secao 8 da constituicao.

Aplicar nos DOIS lados: chave do mapa em `:1307` (preservando `nomes.push` com o rotulo curado, que
alimenta os selects visiveis) e nos tres consumidores `:2589`, `:2715`, `:5603`. Em `:5615` separar
`ccExibido` de `ccChave`, para a exportacao continuar mostrando o valor gravado e nao a chave em
caixa alta. Consumidores sao exatamente tres, confirmado.

O que ela compra, e e honesto: hoje o MESMO campo `centro_custo` e comparado com duas reguas
diferentes, `_cpChaveFiltro` no filtro e `.trim()` puro no lookup de gestor. Um CC gravado como
`"comercial soulan"` ou com dois espacos passa pelo filtro e DESAPARECE do Responsavel. As portas de
entrada dessa divergencia estao abertas: edicao individual da fatura (`:5781`) e Alterar em Massa
(`:3133`), ambas gravam valor cru. E correcao de inconsistencia interna mais profilaxia, nao o
conserto do caso.

### 2.2. O item 2 da OS deve SAIR do pacote

A OS pedia "padronizar a grafia dos centros de custo gravados na base", com dry-run e backup. A
medicao diz que nao ha grafia divergente para padronizar: 0 docs ganham com normalizacao, e os 83
sem area tem todos a MESMA grafia. Manter o item significa escrita em massa em producao, backup,
auditoria e aprovacao do diretor para **reescrever docs com o valor que eles ja tem**. Escrita sem
ganho e risco puro. Recomendacao: sai (Q1).

### 2.3. Os 1.114 docs com CC vazio, e os 83 com area inexistente

Hoje os dois estados mostram a mesma coisa, "nao informado", com causas opostas, e a acao do
operador e diferente em cada um. Proposta: CC vazio continua "nao informado"; CC preenchido sem area
passa a mostrar **"area nao cadastrada"**, que nomeia a causa e aponta para o `master.html`. Mais a
sentinela `__CC_SEM_AREA__` no filtro de CC, no mesmo idioma das tres sentinelas que ja existem
(`:710`, `:722`, `:737`), isolando os 83 em um clique. Texto de apoio de celula, minuscula, sem
travessao.

---

## 3. FRENTE 2, CARDS CUSTO INTERNO x EXTERNO

### 3.1. O defeito que a frente conserta: R$ 4,72 milhoes invisiveis

Total do recorte, tarifa expurgada: R$ 48.741.716,93. Os cards de natureza de hoje (OPEX + Cliente)
mostram R$ 44.023.730,61. **Faltam R$ 4.717.986,32, que e 9,7% do custo, e nao aparecem em card
nenhum**: PJ (R$ 3.166.730,36), que o OPEX deixa de fora, mais sem tipo (R$ 1.551.255,96), que nunca
teve card.

| card | valor |
|---|---|
| OPEX hoje (Interno CLT + Externo, PJ fora) | R$ 18.549.404,72 |
| Custo Fornecedor Interno novo (CLT + PJ) | R$ 5.627.953,39 |
| Custo Fornecedor Externo novo | R$ 16.088.181,69 |
| Custo Cliente (mantem) | R$ 25.474.325,89 |
| Sem Classificacao (novo) | R$ 1.551.255,96, 1.931 docs |

Interno + Externo novo = R$ 21.716.135,08, ou seja R$ 3.166.730,36 acima do OPEX de hoje, e o delta
e EXATAMENTE o bucket PJ. Diferenca explicada, nada sobrando.

### 3.2. Layout: duas fileiras de quatro, e a prova e aritmetica

Manter UM wrapper com `id="kpi-grid-cp"` (tres listeners dependem desse id: `:6249`, `:6345`,
`:6355`) e dentro dele duas fileiras `lg:grid-cols-4`:

- **Caixa E Status:** Total Geral, Total Pago, A Pagar, Tarifas E Comissoes
- **Natureza Do Custo:** Custo Fornecedor Interno, Custo Fornecedor Externo, Custo Cliente, Sem Classificacao

Nao esmaga, e o argumento nao e opiniao: **1/4 da largura e MAIOR que o 1/6 de hoje**, e o maior
valor a exibir (R$ 25.474.325,89, 16 caracteres) ja e renderizado hoje a 1/6 com `truncate`. Nenhum
card fica mais estreito do que ja e. A fileira separada tambem faz o operador ver que os 4 cards de
natureza SOMAM o Total Geral. Prova visual obrigatoria em 1920, 1440 e 1280, nos dois temas.

### 3.3. Os cards apontam para o filtro de Tipo, e `classSetExpandido` fica intocado

A forma de garantir que `classSetExpandido` (`:2444-2500`) nao quebra e nao encostar nele. Os cards
novos mapeiam para `cp-filtro-tipo` (`:717-728`), que JA tem exatamente os valores necessarios,
inclusive a sentinela `__SEM_TIPO__`. `MAP_CLASS_FILTRO` (`:2383`) e o filtro Classificacao ficam
byte a byte iguais.

Mudanca unica no mecanismo: `_KPI_FILTRO_MAP` (`:6278-6283`) passa de `valor` escalar para
`valores: []`, com comparacao de CONJUNTO em `:6296` e `:6321`. O card Interno seleciona
`['Fornecedor Interno', 'Fornecedor Interno - PJ']` de uma vez.

O card "Sem Classificacao" e REUSO da sentinela `__SEM_TIPO__`, nao duplicacao. Um cuidado de
precisao: `:2489` (filtro) usa `.trim()` e `:2787` (KPI) nao, entao um tipo com espaco em branco
cairia em lugares diferentes. Alinhar o KPI ao filtro. Se `semClass` mudar por causa do `trim`,
existem docs com tipo em branco e isso e achado de dado a REPORTAR, nao a silenciar.

### 3.4. Reuso sem recalculo, e a prova de que nada mais muda

Os quatro buckets entram DENTRO do laco unico de `:2762-2790`, no mesmo ponto onde `opex` e `cliente`
ja somam, lendo o `v` ja calculado em `:2764`. Zero segunda passada, zero reinvocacao.

Prova ESTRUTURAL de que Total Geral, Pago, A Pagar e Tarifas nao mudam: essas variaveis sao
calculadas ANTES da linha `:2787`, onde a mudanca mora, e nenhuma linha nova escreve nelas. Os dois
`continue` (expurgo de tarifa em `:2779`, limiar de ano em `:2763`) ficam intactos, logo o CONJUNTO
somado nao muda. `kpi-vencido` nao tem elemento no DOM, entao nao ha numero de tela para mudar.

Prova EMPIRICA do tester, sobre a funcao real extraida do codigo: os 5 valores preservados lidos do
DOM tem que ser strings IDENTICAS antes e depois, comparadas como texto. Mais as invariantes
I1 a I7 do desenho, com destaque para `interno + externo + cliente + semClass === total` como
identidade exata.

**Dependencia de sequencia, e se for perdida a prova fica impossivel:** capturar os 6 cards atuais
em preview do HEAD ANTES do primeiro commit da frente.

---

## 4. FRENTE 3, ONDA 3, EMPRESA NA IMPORTACAO

### 4.1. O seletor

Componente: o mesmo padrao que a Onda 2 ja construiu, `<select data-checkbox-multi data-cb-portal>`
com `_cpSelectSingleGuard` (`:4318`), que e o idioma do projeto para "multi que se comporta como
unico". `<select>` cru e proibido. Catalogo: `_cpEmpresasOficiais` (`:3040-3049`), ja em memoria,
zero leitura nova.

O catalogo precisa de CURADORIA do diretor antes de virar seletor de carimbo (Q4). Hoje ele oferece
5 opcoes e duas sao suspeitas. Blindar a leitura nao resolve: o sistema nao tem como saber que
`RAFUL` nao e uma empresa do grupo.

A trava tem que ser em DUAS camadas, porque a constituicao diz que a guarda mora no codigo e num
teste, nao na disciplina de quem clica:
1. Botao nasce `disabled`, habilita no `change` do seletor.
2. **Guarda de abstencao no caminho da escrita:** empresa do lote vazia no momento do `writeBatch`
   (`:4687`) aborta e NAO grava nada. Sem a camada 2 a trava e so visual.

Ordem: o seletor vem ANTES do gate da Onda 2, porque o gate pode cancelar a importacao (`:3866`) e
pedir empresa depois de o operador classificar 30 favorecidos joga o trabalho dele no lixo.

Modal de preenchimento: espelhar `modal-cp-classificacao` (`:814`), overlay SEM
`data-modal-overlay`, fecha por Cancelar ou Salvar, Escape cancela. NAO copiar
`modal-central-importacao` (`:869`), que tem overlay clicavel por ser modal de navegacao.

### 4.2. O carimbo, e como o ETL sabe quem herdaria

Ponto da escrita: dentro do `batch.set` de `:4703-4757`, junto de `tipo_entidade` (`:4733`).

Dois campos: `empresa` (UPPER, como `_cpResolverEmpresaDoReg` ja trata) e **`empresa_origem`**
com valores `'importacao' | 'fornecedor' | 'manual' | 'backfill'`. O rastro nao e enfeite: e ele que
sustenta a guarda da cascata. Precedente de nomenclatura: `centro_custo_origem` (`:5416`).

O ETL JA TEM a informacao em memoria, sem leitura extra: `cpCarregarFornecedoresMap`
(`:3594-3603`) carrega o doc inteiro do fornecedor, e `:3748` amarra `lanc._fornecedor`. Logo a
decisao em `:4703` e: se `l._fornecedor?.empresa` nao for vazia, grava o valor herdado com
`empresa_origem: 'fornecedor'`; se for vazia, grava a empresa do lote com
`empresa_origem: 'importacao'`. **So carimba quem nao herdaria.**

Divergencia de chaveamento a contar na prova, nao a presumir zero: o ETL casa fornecedor por codigo
numerico (`:3401`) e o runtime casa por codigo E por doc-id (`:1633-1634`). Existe caso de borda em
que o runtime herdaria e o ETL concluiria "nao herda".

Consequencia da regra que o diretor precisa saber: os 12 valores de lixo em `Fornecedores.empresa`
(nome de fornecedor no campo empresa) sao PRESERVADOS pela regra "quem herda, mantem". O carimbo nao
limpa esse lixo, e limpa-lo e frente propria.

### 4.3. A coluna Empresa: nenhuma informacao sai da tela

Achado que muda a pergunta da OS: a coluna "Favorecido" (`:298`) renderiza `r.observacao` (`:2703`),
e a coluna "Detalhe / Obs." (`:2709`) renderiza **o mesmo `r.observacao`**. Esta duas vezes na tela
hoje. Entao substituir Detalhe/Obs por Empresa nao perde `observacao`: perde apenas o badge de
`codigo_titulo_ord` (`:2706-2708`).

Decisao do coordenador: **substituir, e migrar o badge `codigo_titulo_ord` para a coluna Codigo**
(`:2702`), que hoje tem `w-20` e mostra so um numero. Assim nada sai da tela, a tabela continua com
10 colunas, e o numero do titulo fica ao lado do codigo do fornecedor, onde ele pertence.

A coluna nasce com as tres coisas: ordenavel (`case 'empresa'` em `obterValorSortCP`), filtro
multiselect que **JA EXISTE** (`cp-filtro-empresa`, `:705-712`, com sentinela `__SEM_EMPRESA__`), e
celula com "nao informado" para vazio. A coluna funciona para os 44.586 herdados desde o primeiro
render, porque `r.empresa` ja vem resolvido em memoria.

### 4.4. A GUARDA DA CASCATA, o ponto mais delicado do pacote

Mecanismo atual: `cpCascataCampoFornecedor` (`master.html:4332-4386`) consulta
`where('codigo_fornecedor','==',cod)` (`:4349`) e **nao filtra mais NADA**, nem data, nem lote, nem
origem. Atualiza TODAS as faturas daquele fornecedor, em chunks de 400, e o erro e engolido por
`try/catch` (`:4383`). Gatilhos: edicao individual (`:4248-4251`) e Alterar Empresa em Massa
(`:4539`).

O dano concreto: carimbar `NEAT` no lote de janeiro e, em marco, alguem trocar a empresa da ficha
daquele fornecedor para `SOULAN ADM` faz a cascata reescrever as faturas de janeiro tambem. A
verdade do lote e apagada em silencio.

**A guarda:** decide por `empresa_origem`, no `forEach` de `:4359`, que JA itera os docs carregados.
Exclui do update os docs com origem `'importacao'`, `'manual'` ou `'backfill'`. Tres propriedades
deliberadas:

1. **Custo zero:** os docs ja vem no `getDocs` de `:4358`. Nenhum `where` novo, nenhum indice novo.
2. **Escopo cirurgico:** so quando `campo === 'empresa'`. CC e tipo cascateiam como hoje.
3. **Ausencia do campo conta como `'fornecedor'`, isto e, cascateia.** Esta e a PROVA de que a
   guarda nao quebra o uso legitimo, e a prova e aritmetica: **os 51.181 docs de hoje nao tem
   `empresa_origem`**. Para 100% da base atual a guarda e um no-op. So doc criado DEPOIS, com
   carimbo explicito, fica protegido. O tester prova isso nos dois sentidos no emulador.

Transparencia obrigatoria, porque abster-se em silencio e tao ruim quanto sobrescrever em silencio:
a cascata passa a devolver tambem os PRESERVADOS, e a mensagem diz
`"N fatura(s) atualizada(s) em cascata (Empresa). M preservada(s) por terem empresa definida na
importacao."` Se `M > 0`, a mensagem aparece mesmo quando `N == 0`.

Alternativa descartada: usar `cascata_origem` (`:4374`) como marcador nao serve, porque e uma string
UNICA por doc compartilhada entre os tres campos cascateaveis, e uma cascata de CC sobrescreveria o
marcador de uma cascata de empresa.

### 4.5. O backfill dos 6.266 esta BLOQUEADO, e nao por falta de codigo

Molde obrigatorio: `scripts/purge-area-team-tailor.cjs`, que e o padrao maduro do projeto. Dry-run
por padrao (`--apply` para aplicar), backup em `scripts/backup-*.json` (ja protegido em dois lugares,
`firebase.json` e `.gitignore`), so `update` in-place, nunca apagar, salvaguarda que ABORTA se algum
doc do conjunto ja tiver empresa, idempotente. O dry-run imprime a AGREGACAO primeiro (contagem e
soma por empresa proposta x ano, mais amostra de 20), nao 6.266 linhas.

**O que o script nao resolve: de onde vem a empresa desses 6.266.** Eles sao exatamente os docs cujo
fornecedor nao tem empresa no cadastro. Se o sistema soubesse derivar, eles nao estariam na lista.
So o diretor destrava (Q5). **Nenhum codigo deve ser escrito para este item antes da resposta.**

### 4.6. O impacto no DRE e MENOR do que parecia, e e quantificavel

`empresaDespesa` (`dre:318-324`) da precedencia a `reg.empresa`, mas o que decide a aba e
`normalizarEmpresa` (`:303-311`), que colapsa tudo em 5 baldes: qualquer rotulo contendo SOULAN vira
`SOULAN`. Consequencias, em ordem:

1. **SOULAN ADM e SOULAN CONS sao o MESMO balde.** Trocar uma pela outra no carimbo nao muda nada no
   DRE. Isso derruba a maior parte do risco suposto.
2. **Onde muda de verdade:** os 6.266 sem empresa caem hoje em `OUTRAS` e migrariam para o balde
   real. E redistribuicao entre abas.
3. **CONSOLIDADO e INVARIANTE**, porque soma tudo inclusive `OUTRAS` (declarado em `dre:302`).
4. **O caminho ja esta aberto hoje, sem controle** (`:5766`). A Frente 3 nao inaugura o risco, ela o
   torna deliberado, rastreado e auditavel.

Prova numerica, com veredito de PARADA onde cabe: P1 consolidado por mes identico byte a byte; P2
soma das abas mais OUTRAS igual ao consolidado; P3 `OUTRAS` so DIMINUI; P4 delta de cada aba igual a
soma exata dos docs que sairam de OUTRAS para ela, doc a doc; P5 divisao CUSTOS/G&A inalterada.
Extraindo `empresaDespesa` e `normalizarEmpresa` DO ARQUIVO do DRE, sem reimplementar.

---

## 5. FRENTE 4, ONDA 4, GRUPOS DE DESPESA

### 5.1. A ancora e `categoria`, nao `CP_Base_Despesas`, e a decisao tem tres provas

1. **Cobertura:** `categoria` cobre 100%; `CP_Base_Despesas` cobre 27,7%. Ancorar no cadastro
   entrega uma coluna em que 37.026 linhas dizem "nao informado" e um DRE em que 72,3% do dinheiro
   cai num balde "Sem Grupo" maior que todos os grupos somados.
2. **O DRE ja decidiu isso e esta validado:** `catDespesa` (`dre:333`) e o universo colhido de toda
   a base (`dre:348-357`) ja usam `categoria` como Tipo de Despesa.
3. **O diretor ja decidiu isso em 2026-09-04** (`DIARIO.md:877-881`), classificando a fonte como
   "inadequada", e o codigo carrega a decisao em comentario (`code.html:2037-2038`).

O terceiro caminho, reusar o fuzzy do ETL, foi RECUSADO com argumento: `calcularSimilaridade`
(`:3578-3588`) retorna 1 para prefixo, e `_cpMelhorMatchDespesa` (`:3620-3633`) faz `break` no
primeiro score 1, entao `"VALE TRANSPORTE - CALCULO - TE"` casaria com o PRIMEIRO candidato da ordem
de leitura do Firestore. Vinculo contabil decidido por ordem de iteracao e numero errado no DRE que
ninguem consegue explicar.

**A medicao nova fecha o assunto: `categoria` tem zero corrupcao.** O mojibake de
`CP_Base_Despesas` (40 de 112) nao toca esta frente e segue como frente separada.

### 5.2. O modelo, com vinculo por ID e nunca por nome

Tres colecoes novas, mais um doc de catalogo:

- **`CP_Grupos_Contas`** (auto-id): `nome`, `nome_norm`, `bucket_dre` (nasce `null`), `ordem`, auditoria.
- **`CP_Contas_Despesa`** (auto-id): mais `grupo_id` e `grupo_nome` (o nome so para log e auditoria,
  NUNCA para render).
- **`CP_Tipos_Despesa`** (docId slug deterministico, cerca de 104 docs): `tipo`, `tipo_norm`,
  `conta_id`, `conta_nome`, `origem`.
- **`Metadados/CP_Catalogo_Categorias`** (doc unico, cerca de 7 KB): a lista dos 104 tipos com
  contagem de docs.

Por que ID e nao nome: renomear um Grupo passa a ser `updateDoc` de 1 campo em 1 doc, sem tocar
Conta, Tipo nem lancamento. E o oposto do que existe hoje com `centro_custo`, cujo vinculo e por
NOME e cuja fragilidade o proprio codigo admite (`master.html:3222-3224`), e que **produziu o caso
Catarina**. Nao repetir o erro num nivel novo. O render resolve o nome ao vivo pela cadeia de IDs.

Por que o doc de catalogo e a pedra angular: sem ele, o `master.html` teria que ler 51.181 docs para
descobrir quais sao os 104 tipos e o volume de cada um. Com ele, le 1 doc. E ele entrega de graca as
tres coisas que fazem o trabalho braçal caber: a lista, a ordenacao por volume, e o contador de
saude. `Metadados` ja existe nas rules com escrita liberada (`firestore.rules:302-309`), entao
**zero rules novas para ele**. Escrito no gancho que ja existe (`:3908`, `:4082`) mais um botao
explicito, nunca em carga de pagina.

Chave de normalizacao: semantica de `_cpChaveFiltro`, que **preserva acento de proposito**
(`:1992-1995`, incidente ESTAGIO de 2026-06-19, em que strip de acento juntou valores distintos no
Faturamento). Nao usar `cpNormalizarTexto`, que derruba acento.

### 5.3. Heranca em RUNTIME, confirmada por analise

Custo de montar o mapa e praticamente zero porque **o laco ja existe**: `_cpIngerir`
(`:1706-1778`) ja percorre `cacheRegistros` inteiro em `:1740-1748`. E o mapa novo nao e indexado
por lancamento: sao 104 entradas, e resolver uma linha sao dois ou tres `Map.get` sob demanda no
render de 50 linhas por pagina. Referencia de grandeza da propria casa: um passe COMPLETO de filtro
sobre 11.094 docs mede 25 a 36 ms (`DIARIO.md:884`).

Custo de gravar seria 51.181 updates, e **nao uma vez**: o diretor vai mexer nos vinculos
iterativamente, e cada "movi o tipo X do grupo A para o B" viraria recascata em massa com auditoria
de seguranca a cada rodada. Inviavel.

A linha que separa `centro_custo` (gravado) de `empresa` (runtime) nao e gosto: `centro_custo` e
EDITAVEL por lancamento, `empresa` e funcao pura do fornecedor. O Grupo e funcao pura de `categoria`
e nao existe nada por lancamento para sobrescrever. Cai do lado runtime.

**Regra dura de implementacao:** o grupo NUNCA toca o objeto do registro. Funcao pura
`_cpResolverGrupoDoReg(reg)` chamada inline no render, filtro e sort. Zero campo sintetico. O motivo
esta no risco R1 abaixo, e ja tem veto registrado em `DIARIO.md:900-908`.

### 5.4. Cadastro no `master.html` e a coluna no CP

Quarta sub-aba em "Regras de Classificacao". O switcher e generico (`:2308-2322`), entao o HTML e
puramente aditivo, zero linha de JS de navegacao alterada. Tres paineis no molde de Areas & Gestores
(`:338-475`), com dedup por `nome_norm`, guarda de perfil e log, todos espelhando `:3200-3213`.

**Exclusao BLOQUEADA enquanto houver filho**, nao apenas avisada como o precedente de `:3279-3283`.
Apagar um Grupo com Contas filhas deixaria orfao e faria o DRE perder o pai de uma linha de dinheiro.
Abster-se e o comportamento seguro, e a guarda mora no codigo e num teste.

O que faz o trabalho braçal caber: ordenacao por VOLUME, e o dado e contundente. Os 15 maiores tipos
somam 36.298 de 51.181 lancamentos (70,9%), e colapsam em **9 familias** pelo prefixo do ERP
(`VALE TRANSPORTE - CALCULO` 10.194 docs, `SALARIO LIQUIDO A PAGAR` 7.681,
`VALE REFEICAO - CALCULO` 6.626, `ADIANTAMENTO DE SALARIOS` 4.485, e mais 5). **9 vinculos cobrem
70,9% da base.** A familia e so agrupamento VISUAL; o vinculo gravado continua sendo um doc por
Tipo, individual e auditavel. Mais selecao multipla com "Vincular Selecionados A", em `writeBatch`.

Coluna "Grupo de Contas" a direita de "Despesa", mostrando o Grupo com a Conta no `title`. Filtro
multiselect novo (`cp-filtro-grupo`) com catalogo em uniao cadastro mais base (`_cpUniaoOpcoes`,
`:2003-2022`) e sentinela `__SEM_GRUPO__`. Ordenavel. A busca rapida NAO passa a achar por grupo, e
e escolha explicita: incluir no `_cpBlobBusca` (`:1720-1725`) obrigaria reconstruir 51.181 blobs a
cada mudanca de cadastro, que e exatamente o custo que o desenho runtime evita.

**Problema do molde que precisa de decisao:** o padrao que a OS manda seguir usa `<select>` cru
(`master.html:371-374`), e `assets/checkbox_multi.js:38` so faz upgrade de `<select multiple>`.
**Nao existe componente de selecao UNICA no design system.** O caminho e criar a variante nesse
arquivo compartilhado, com o coordenador como dono e todos os consumidores verificados.

### 5.5. O DRE por grupo deve ser CORTADO do pacote

Recomendacao do arquiteto, e eu concordo. O motivo que decide sozinho: **o DRE por grupo nao tem o
que mostrar no dia em que for construido.** Ele depende dos 104 vinculos, que so existem depois de o
diretor passar um tempo na tela nova, que so existe depois de 4a estar em producao. Construir junto
significa validar uma arvore de relatorio contra uma dimensao VAZIA e revalidar depois com dado real:
duas validacoes para uma entrega.

Mais tres razoes: o bucket e decisao pendente do diretor, e construir antes da resposta e construir
duas vezes; e o unico item do pacote que mexe em dinheiro na tela, e misturar isso com cadastro novo,
coluna nova e rules novas na mesma validacao maximiza a chance de o pacote inteiro travar; e o deploy
de rules ja e caminho critico proprio de 4a, e 4b nao adiciona rules.

**4a, o minimo viavel que entrega valor no dia 1:** as 3 colecoes, as rules, o doc de catalogo, o
cadastro de Grupos e Contas com vinculo em massa, e a coluna com filtro e ordenacao. Com isso o
diretor agrupa os 104 tipos, filtra e ordena o CP por grupo, e ve o total do recorte pelos KPIs que
ja existem. Analise de despesa por grupo funcionando, sem tocar em nenhum numero validado.

O que NAO cortar de 4a: a sentinela `__SEM_GRUPO__` e o contador de saude. Sao o que permite ao
diretor saber se o trabalho dele esta completo.

### 5.6. A conexao com o DRE, e a decisao que nao pode ser tomada pela fabrica

Hoje o bucket vem de QUEM RECEBEU o dinheiro: `/CLIENTE/.test(tipo_entidade)` (`dre:329-331`). Com
87,5% dos lancamentos sendo Cliente, quase tudo e Custo. Com grupos, o bucket poderia vir DO QUE FOI
GASTO. O fato que torna a pergunta respondivel por quem nao e tecnico: **em qualquer cenario o
EBITDA e identico ao centavo**, porque Custo e G&A sao subtraidos os dois. O que muda e so a
fronteira entre eles, e portanto o Lucro Bruto e a Margem Bruta (Q6).

---

## 6. AS DECISOES QUE O COORDENADOR TOMOU (dentro do documento, nao vao ao diretor)

1. Funcao de normalizacao LOCAL, reusando `_cpChaveFiltro`. Nada migra para `core_rules.js`.
2. Ancora da Onda 4 e `ContasAPagar.categoria`. `CP_Base_Despesas` fora do caminho.
3. Heranca de grupo em RUNTIME, sem gravar campo no lancamento.
4. Vinculo do modelo de 3 niveis por ID, com resolucao de nome ao vivo.
5. Cards em duas fileiras de quatro, mantendo o `id="kpi-grid-cp"` no wrapper.
6. Cards novos apontam para `cp-filtro-tipo`; `MAP_CLASS_FILTRO` e `classSetExpandido` intocados.
7. Filtro "Classificacao" permanece como esta nesta onda (nao mexer em codigo validado sem pedido).
8. Coluna Empresa SUBSTITUI Detalhe/Obs, com o badge `codigo_titulo_ord` migrando para a coluna
   Codigo. Nenhuma informacao sai da tela.
9. Guarda da cascata decide por `empresa_origem`, com ausencia do campo cascateando.
10. Coluna do grupo mostra o Grupo, Conta no tooltip, um filtro novo so.
11. Lista de vinculo nasce ordenada por VOLUME de lancamentos.
12. Mojibake de `CP_Base_Despesas` fica FORA do pacote (nao toca a ancora escolhida).
13. Sugestao automatica de vinculo nao entra (adivinha, e valor baixo enquanto o diretor ainda esta
    definindo os grupos).

---

## 7. ORDEM DE EXECUCAO E SERIALIZACAO OBRIGATORIA

As Frentes 3 e 4a tocam os MESMOS 6 pontos de `gerenciador_contas_pagar_desktop/code.html`:
`<thead>` (`296-309`), `renderTabela` (`2696-2732`), `obterValorSortCP` (`2582-2593`),
`aplicarFiltrosCP` (`2417-2517`), modal de filtros (`690-749`) e populador de dropdowns
(`2029-2092`). **Em paralelo elas se sobrescrevem em silencio e o segundo a gravar apaga o
primeiro sem nada falhar.** O coordenador e dono do arquivo e serializa.

Ordem: **Frente 1, Frente 2, Frente 3, Frente 4a.** A Frente 3 vem antes da 4a porque ela define
quais colunas existem. A Frente 3 tambem toca `master.html` (a guarda da cascata), e a 4a tambem (o
cadastro), com o coordenador dono dos dois.

Caminho critico proprio de 4a: `firestore.rules` com tres `match` novos, teste no emulador, e
**deploy de rules ANTES do deploy de hosting**, senao o cadastro novo nasce em `permission-denied`
(nao existe match catch-all: colecao nao declarada e negada por padrao).

Antes do primeiro despacho: o `seguranca` audita ESTE mapa, nao so o codigo depois. O `tester` entra
JUNTO com a construcao, escrevendo a partir do requisito.

---

## 8. RISCOS DE ALCANCE, os que mandam

| # | risco | onde | gravidade |
|---|---|---|---|
| R1 | **Vazamento de campo derivado para producao, JA ACONTECENDO.** `reg.empresa` e mutado em memoria (`:1742`, `:1770`) e `_cpProjetarRecorrencia` faz `...reg` (`:5746`) e `batch.set` (`:5766`), ate 120 clones por edicao. A empresa derivada em runtime esta sendo persistida, e o DRE passa a congelar aquele valor. Contraria veto registrado em `DIARIO.md:900-908`. Achado independente pelos DOIS arquitetos, conferido por mim | `code.html:1742`, `:1770`, `:5746-5766` | **alta, pre-existente** |
| R2 | **Cascata apaga a verdade do lote** sem filtro de lote, data ou origem, e o erro e engolido por `try/catch` | `master.html:4348-4386` | **critica, endereçada pela guarda** |
| R3 | **DRE redistribui entre abas** por precedencia de `reg.empresa`. Consolidado invariante; SOULAN ADM e CONS no mesmo balde reduz muito o alcance | `dre:318-324`, `:303-311` | **alta, tela validada** |
| R4 | **Colecao nova e NEGADA por padrao.** Sem deploy de rules antes do hosting, cadastro novo nasce quebrado | `firestore.rules` | **alta** |
| R5 | **Colisao de 6 pontos entre Frentes 3 e 4a no mesmo arquivo** | `code.html` | **alta, resolvida por serializacao** |
| R6 | **Tag `<script>` esquecida** se alguem mover a normalizacao para `core_rules.js`, que o CP nao carrega | `code.html:7-69` | alta se acontecer |
| R7 | **Card e filtro discordarem sobre PJ:** o buraco esta em `:2788` E em `MAP_CLASS_FILTRO` (`:2384`) | `code.html` | media |
| R8 | **DRE le `ContasAPagar` inteira sem limite** (51.181 docs) e reprocessa 5 abas a cada snapshot. Mesma classe do que o CP resolveu com carga por recencia, e nao esta no backlog | `dre:624-630` | media, pre-existente |
| R9 | **Nao existe componente de selecao unica** no design system; o molde da OS usa `<select>` cru | `assets/checkbox_multi.js:38` | media |
| R10 | **Divergencia de chave de fornecedor** entre ETL (numerico) e runtime (numerico e doc-id): contar os casos de borda, nao presumir zero | `:3401` vs `:1633-1634` | baixa |
| R11 | **Se Detalhe/Obs morrer, o badge `codigo_titulo_ord` perde o lugar.** Endereçado: migra para a coluna Codigo | `:2706-2708` | baixa |
| R12 | **`_areaGestorMap` morto no Custo de Folha:** listener de `AreasContasPagar` sem consumidor. Nao tocar; registrar, para ninguem "consertar" tela validada por nada | `custo_folha_desktop/code.html:2223` | baixa |

---

## 9. AS PERGUNTAS QUE SO O DIRETOR RESPONDE

**Q1. Tiro o item 2 da Frente 1 (padronizar a grafia dos centros de custo)?**
A medicao diz que nao ha grafia divergente: 0 docs ganham com normalizacao e os 83 sem area tem
todos a mesma grafia. Manter o item e escrita em massa em producao para regravar o valor que o doc ja
tem. **Recomendo tirar.**

**Q2. A Catarina e de qual area? (BLOQUEIA o conserto dos 83)**
Os 83 lancamentos estao com `COMERCIAL`, e nao existe area com esse nome. Existem tres: COMERCIAL
SOULAN (Marcelo Medeiros), COMERCIAL THOMAS (Rejane Matos), COMERCIAL TEAM TAILOR (Rejane Matos).
(a) e uma das tres, e reapontamos os 83 e corrigimos o cadastro dela; (b) COMERCIAL e area de
verdade, com gestor proprio, e criamos. **Recomendo (a)**, porque criar uma quarta area "COMERCIAL"
ao lado de tres "COMERCIAL algo" fabrica a proxima confusao.

**Q3. O card OPEX desaparece ou continua?**
Com os quatro novos ficam 8 cards; mantendo OPEX, 9. **Recomendo tirar**, por dois motivos: o OPEX
de hoje deixa o PJ de fora, entao ele ja mostra R$ 3,17 milhoes a menos; e com Interno e Externo
lado a lado, quem quiser OPEX soma dois cards. Se ficar, tem que ser CORRIGIDO para incluir PJ, e ai
o numero dele muda em R$ 3.166.730,36 e exige prova propria.

**Q4. Quais das 5 entradas de `Base_Empresas` sao empresas de verdade? (BLOQUEIA o seletor)**
O catalogo tem `NEAT`, `SOULAN ADM`, `SOULAN CONS` (que aparece na tela como "SOULAN CONSULTORIA"),
mais `RAFUL` e `SOULAN CONSULTORIA 3`. O seletor de carimbo nao pode oferecer entrada que nao seja
empresa alocavel, e o sistema nao tem como saber quais sao. Diga quais ficam.

**Q5. De onde vem a empresa dos 6.266 lancamentos antigos? (BLOQUEIA o carimbo em massa)**
Sao exatamente os lancamentos cujo fornecedor nao tem empresa no cadastro. O sistema nao tem como
adivinhar. (a) o senhor da o criterio (por arquivo de origem, por periodo, por lista de
fornecedores); (b) **corrigir os CADASTROS dos fornecedores** e deixar a cascata resolver, que e
mais barato e conserta o futuro tambem; (c) nao fazer agora, e os 6.266 seguem em OUTRAS no DRE, como
ja estao hoje. **Recomendo (b)**, e depois medir quantos sobram: provavelmente poucos fornecedores
respondem por muitos lancamentos, e ai o trabalho e de cadastro e nao de escrita em massa.

**Q6. O DRE por grupo entra agora ou vira a frente seguinte?**
(a) entra agora; (b) **fica para a frente seguinte**, e agora entram o cadastro de grupos e a coluna
no Contas a Pagar, com filtro e ordenacao. **Recomendo (b)**: o DRE por grupo so mostra algo depois
que o senhor tiver agrupado as despesas na tela nova, e a tela nova so existe depois desta entrega.
Construir os dois juntos obriga a validar o DRE duas vezes, uma vazia e uma cheia.

**Q7. O que e "Custo" no DRE continua sendo decidido por quem recebeu o dinheiro, ou passa a ser
decidido pelo grupo?**
Hoje o sistema olha o favorecido: se e Cliente, e Custo; o resto e Despesa. Em 2026 isso da
R$ 25.474.325,89 de Custo e R$ 23.267.391,04 de Despesa. **Em qualquer opcao o EBITDA fica identico
ao centavo**; muda a divisao entre Custo e Despesa, e portanto o Lucro Bruto e a margem.
(a) continua como esta, nenhum numero muda, e o grupo entra so como organizacao dentro de cada
faixa, podendo o mesmo grupo aparecer nas duas; (b) o grupo decide, o relatorio fica limpo, mas ate
R$ 25,4 milhoes podem migrar de Custo para Despesa e o Lucro Bruto muda; (c) **misto**, nada muda ate
o senhor dizer grupo por grupo, e cada grupo classificado migra sozinho com antes e depois so dele.
**Recomendo (c).** Se Q6 for (b), esta pergunta pode ser respondida na frente seguinte.

**Q8. Ciencia de que a Frente 3 muda a distribuicao do DRE por empresa.**
Nao e escolha, e ciencia: gravar empresa no lancamento muda `empresaDespesa`. O total CONSOLIDADO
nao muda. Os lancamentos que hoje aparecem em OUTRAS passam a aparecer na empresa certa. Trocas entre
SOULAN ADM e SOULAN CONS nao mexem em nada, porque caem no mesmo balde. E o caminho ja esta aberto
hoje sem controle (R1). Confirmar que esta ciente antes de aplicar.

---

## 10. O QUE JA ESTA PRONTO PARA O PROXIMO PASSO

Sem resposta as perguntas, o que pode ser construido: Frente 1 (a normalizacao e os estados de tela,
sem o conserto dos 83), Frente 2 inteira, e da Frente 3 os passos que nao dependem do catalogo
curado. O que esta travado: o conserto dos 83 (Q2), o seletor de empresa (Q4), o carimbo em massa dos
antigos (Q5), e o recorte da Onda 4 (Q6).
