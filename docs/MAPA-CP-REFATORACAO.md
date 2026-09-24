# Mapa do que JÁ EXISTE — Refatoração do Contas a Pagar (modelo Soulan)

> Investigação apenas (2026-09-24). NÃO propõe solução, NÃO implementa. Base para o
> diretor e o coordenador desenharem a refatoração sobre o real.
>
> Telas vivas: **`gerenciador_contas_pagar_desktop/code.html`** (a tela do CP) e
> **`master.html`** (a tela de configuração: aba "Áreas & Gestores" + "Fornecedores
> & Autônomos" + "Banco de Despesas"). O `contas_a_pagar_desktop/` é legado
> exterminado. Fonte cruzada: `DOCUMENTO_MESTRE.md`.

---

## 0. Coleções do Firestore envolvidas

| Coleção | O que guarda | Chave |
|---|---|---|
| `ContasAPagar` | Lançamentos (as faturas/despesas) | auto-id |
| `Fornecedores` | Ficha do favorecido: `nome`, `codigo`, **`empresa`**, **`centro_custo`**, **`tipo_entidade`** | `String(codigo)` |
| `AreasContasPagar` | Áreas/Centros de Custo internos do CP: `nome`, **`gestor_id`**, **`gestor_nome`** | auto-id |
| `CP_Gestores` | Registro de gestores (responsáveis): `{ nome, email }` | auto-id |
| `Base_Empresas` | Dimensão oficial de empresas alocáveis (lista para dropdowns) | auto-id (`nome`) |
| `Base_Centros_Custo` | Dimensão mestra de CC — **exclusiva do Custo de Folha**, independente do CP | auto-id (`nome`) |
| `CP_Base_Despesas` | Banco de despesas (fuzzy match do ETL) | slug |
| `CP_Beneficios_PJ` | Benefícios de PJ (ponte com Folha) | docId determinístico |
| `RegrasConciliacao`, `CP_BaseMestra` | De-Para aprendido do ETL (Fornecedor+Despesa → classificação) | auto-id |
| `CP_SolicitacoesAprovacao` | Esteira de aprovação (Fase 3) | auto-id |

---

## 1. EMPRESA DO GRUPO

**Existe campo de empresa no lançamento?** NÃO no `ContasAPagar`. O ETL grava
`codigo_fornecedor` mas **não denormaliza `empresa`** no lançamento
(`gerenciador_contas_pagar_desktop/code.html:1540-1544`). A empresa **só existe na
ficha do Fornecedor** (`/Fornecedores.empresa`) e é **derivada em runtime** por
cruzamento `codigo_fornecedor → Fornecedores.empresa`:
- `inscreverFornecedoresEmpresa()` monta `_cpFornecedoresEmpresaMap` (código→empresa)
  em `code.html:1575-1606`; a cascata que resolve a empresa de cada linha começa em
  `code.html:1608`.
- Consequência: **1 empresa por fornecedor** (não por transação). Muitos lançamentos
  ficam **sem empresa** — a própria tela tem a sentinela
  `[ ⚠️ MOSTRAR LANÇAMENTOS SEM EMPRESA ]` (`code.html:721`).

**A tela exibe/filtra por empresa?** SIM. Filtro multiselect `cp-filtro-empresa`
(`code.html:715-721`); opções = união de `Base_Empresas` + valores distintos de
`Fornecedores.empresa` (`code.html:3808`). Há **carimbo em massa** de Empresa (e
Tipo e CC) na "Alterar em Massa" do CP (`code.html:513-525`, `3035`) e, no
`master.html`, botão que "Carimba a empresa em cascata nas faturas"
(`master.html:716-721`, lista de `Base_Empresas`).

**Central de Importações (fluxo de importar).** Modal "Central de Importações"
(`code.html:826-869`), input de arquivo **`.txt`** (`file-cp-txt`, `code.html:777`),
motor **ETL preditivo com fuzzy match** + dedup por SHA-256 do conteúdo (`arquivo_hash`,
`code.html:4060-4101`), gravação em `writeBatch` (chunks de 450). **NÃO há seletor de
empresa no momento da importação** — a empresa não é escolhida ao importar; ela é
inferida depois, do fornecedor. O match do ETL casa por **código** contra
`/Fornecedores` (`code.html:3644-3655`).

---

## 2. TIPO DE FAVORECIDO

**Onde vive:** campo **`tipo_entidade`** em **`/Fornecedores`** (não no lançamento por
padrão). Valores oficiais (master.html): **`Cliente`**, **`Fornecedor Externo`**,
**`Fornecedor Interno`** (o CLT interno), **`Fornecedor Interno - PJ`**
(`master.html:967-970`; conjunto-base em `master.html:3824`). São exatamente os 4
tipos do negócio (externo, interno CLT, interno PJ, cliente).

- O ETL **deriva o tipo do fornecedor** para o lançamento em memória:
  `lanc._tipo_entidade = fornReg.tipo` (`code.html:3649`); tag "É PJ Interno?" herdada
  em `code.html:3255`.
- A tela **filtra por tipo** (`code.html:726-727`, "via `tipo_entidade`", com sentinela
  `[ SEM TIPO / CATEGORIA ]` para faturas de tipo vazio) e permite **carimbo em massa**
  de tipo (`code.html:513-515`; master "Atualiza `tipo_entidade` em cascata",
  `master.html:729`).
- **Inconsistência de rótulo a confirmar:** aparece `Fornecedor Interno (PJ)` em uns
  pontos (`master.html:523`, `3539`) e `Fornecedor Interno - PJ` em outros
  (`master.html:969-970`, `3824`). Dois grafismos para o mesmo tipo.

---

## 3. CENTRO DE CUSTO E RESPONSÁVEL

**A tela de config que o diretor citou EXISTE:** `master.html`, aba **"Áreas &
Gestores"** (`master.html:338-470`):
- **CRUD de Áreas/CC** → coleção **`AreasContasPagar`** (`nome` da área + `gestor_id`
  + `gestor_nome`), listener único em `master.html:3116`; salva o vínculo de gestor em
  `master.html:3200-3213`. Placeholder do nome: "Ex: Operacional, Diretoria, Atração e
  Seleção" (`master.html:363`) — casa com a segmentação que o diretor descreveu.
- **CRUD de Gestores** → coleção **`CP_Gestores`** `{ nome, email }`
  (`master.html:3297-3441`). Cada gestor é uma pessoa; é vinculável a uma área.
- `AreasContasPagar` é **independente** de `Base_Centros_Custo` (essa é só da Folha) —
  comentário em `master.html:312`.

**O responsável já está vinculado aos lançamentos?** SIM, **derivado em runtime por
Centro de Custo**: a tela do CP monta `_areaGestorMap` = `Map<centro_custo →
gestor_nome>` a partir de `AreasContasPagar` e exibe o gestor da linha
(`code.html:5044-5106`). O `centro_custo` **é denormalizado no lançamento** (ao
contrário da empresa): o ETL herda do fornecedor — `ccHerdado =
l._fornecedor.centro_custo` (`code.html:4209`, gravado em `4227`); no caminho PJ há
`centro_custo_origem: 'txt' | 'fornecedor'` (`code.html:4892-4920`). O select de CC do
fornecedor é alimentado pela própria `AreasContasPagar` (`master.html:974`, `1043`),
então o vocabulário fecha: `Fornecedor.centro_custo` = `AreasContasPagar.nome` →
`gestor`.

**Um CC tem sempre o mesmo responsável, ou varia por empresa?** Hoje **sempre o
mesmo**: o vínculo gestor↔CC vive em `AreasContasPagar` **sem dimensão de empresa**.
Um CC = um gestor, global às 3 empresas.

**Caso do CLIENTE (cliente = próprio CC, sem segmentação).** **Não há essa distinção
no dado hoje.** `Cliente` é apenas um valor de `tipo_entidade` em `/Fornecedores`; um
cliente usa a mesma lista de CC (`AreasContasPagar`) que as áreas internas. Nenhuma
regra faz "cliente é seu próprio centro de custo/responsável".

---

## 4. VISÃO GERAL — o que JÁ SUPORTA vs LACUNA

### Já suporta (construído)
1. **4 tipos de favorecido** cadastráveis (`Fornecedores.tipo_entidade`) + filtro +
   carimbo em massa.
2. **Centro de custo com gestor responsável**: `AreasContasPagar` (CC) + `CP_Gestores`
   (pessoas), com tela de config pronta em `master.html`.
3. **Responsável exibido por lançamento** via `centro_custo → gestor` (`_areaGestorMap`).
4. **`centro_custo` denormalizado na transação** (herdado do fornecedor no ETL, com
   rastro de origem txt/fornecedor).
5. **Filtros e carimbo em massa** de Empresa / Tipo / CC na própria tela do CP.

### Lacunas (o que falta para o modelo que o diretor descreveu)
1. **Empresa não é da transação, é do fornecedor.** `ContasAPagar` não guarda
   `empresa`; deriva de `Fornecedores.empresa` (1 por fornecedor). **Não há seletor de
   empresa na importação.** Se o mesmo custo/fornecedor sai de empresas diferentes do
   grupo, o modelo atual não distingue por lançamento; e há muitos lançamentos "sem
   empresa".
2. **Tipo de favorecido nem sempre chega ao lançamento** (fica vazio → sentinela
   "SEM TIPO"), pois depende do fornecedor estar cadastrado/classificado. Rótulos de PJ
   inconsistentes (item 2 acima).
3. **Responsável só por CC, sem dimensão de empresa.** Não há como um mesmo CC ter
   responsáveis diferentes por empresa do grupo (se o negócio exigir isso).
4. **Cliente sem tratamento próprio.** Falta a distinção "cliente = seu próprio CC e
   responsável"; hoje cliente é só um `tipo_entidade`.

---

## 5. Pontos a confirmar com o diretor (não são propostas)
- **3ª empresa: "NIT" (diretor) vs "NEAT" (código).** No código a 3ª empresa do grupo
  aparece como **NEAT** (faturamento/folha, ex.: `core_rules.js` `calcularEmpresaAtribuida`).
  "NIT" só aparece como identificador fiscal (PIS/PASEP/NIT), nunca como empresa.
  Além disso o faturamento trata **ESTÁGIO** como uma "empresa" atribuída. Conferir o
  conteúdo real de `Base_Empresas` (as empresas alocáveis de fato).
- Se **empresa** deve passar a ser atributo da **transação** (carimbada na importação)
  e não do fornecedor.
- Se **responsável** deve variar por **(CC × empresa)** ou seguir só por CC.
