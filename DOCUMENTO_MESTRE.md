# 📘 Documento Mestre Técnico — CentraFin ERP & Dashboards

> **Status:** Mapeamento da arquitetura em produção (snapshot)
> **Data de referência:** 2026-06-24
> **Público-alvo:** Time de desenvolvimento core, arquitetura e governança
> **Natureza:** Manual de referência técnico. Descritivo e estritamente factual — reflete o código existente, não a intenção idealizada.

---

## ⚠️ Nota de Governança — Divergências entre Narrativa e Implementação

Durante o levantamento foram encontradas **três divergências** entre a descrição corrente de negócio e o que o código efetivamente executa. Estão sinalizadas ao longo do documento com o marcador **`⚠️ DIVERGÊNCIA`** e consolidadas aqui:

| # | Tema | Narrativa corrente | Implementação real |
|---|------|--------------------|--------------------|
| 1 | **Faturamento Real** | Consultoria = `Bruto − Impostos` (fallback no Bruto); Terceiros = `Taxa` | **Tudo é baseado em Taxa**: Grupo A = `100% Taxa`; Grupo B = `55% Taxa`. Não existe cálculo `Bruto − Impostos` no motor. |
| 2 | **Verba "000" → "Outros"** | Pipeline intercepta o código `"000"` e força bucket "Outros" | **Não há interceptação explícita de `"000"`.** O parser TXT só reconhece 10 códigos (276/277/284/279/281 + descontos); qualquer outro é descartado silenciosamente. O bucket "Outros valores" é populado por **classificador dinâmico** no Modal Olho, não pelo código "000". |
| 3 | **Clamp removido (Regra do Brendon)** | `Math.max` removido no export de benefícios | O clamp foi removido **no ETL de Contas a Pagar** (preserva sinal negativo). No **export de folha**, `Math.max(0, …)` ainda existe — mas apenas em resíduos de arredondamento de decomposição, não no valor algébrico. |

Estas divergências **não são bugs por si só** — em vários casos a implementação é a correta e a narrativa é que está desatualizada. Recomenda-se alinhar a documentação de negócio a este documento.

---

## 🔬 1. Mapeamento de Infraestrutura e Banco de Dados (Firestore / Auth)

### 1.1 Stack

- **Frontend:** HTML5 + JavaScript Vanilla (ES Modules), Tailwind CSS, ApexCharts.
- **Backend:** Firebase Authentication + Cloud Firestore (sem servidor de aplicação próprio).
- **Persistência de sessão:** `browserSessionPersistence` — a sessão morre ao fechar a aba/janela ([login.html:356](login.html#L356)).
- **Regras de negócio centrais:** [core_rules.js](core_rules.js) (Single Source of Truth para parsers e faturamento).

### 1.2 Esquema de Coleções

| Coleção | Propósito | Chave do documento |
|---------|-----------|--------------------|
| `Usuarios` | Matriz de usuários, IAM e RBAC | `email` (lowercase) |
| `HistoricoAcessos` | Log de login/logout (presença/auditoria) | auto-id |
| `Logs` | Trilha de ações (INCLUSÃO/EDIÇÃO/EXCLUSÃO/ACESSO) | auto-id |
| `Lancamentos` | Faturamento — Contas a Receber (`tipo=receita`) | auto-id |
| `ContasAPagar` | Lançamentos de Contas a Pagar | auto-id |
| `Fornecedores` | Base de fornecedores/PJs/autônomos | `String(codigo)` |
| `CP_BaseMestra` | Mapeamentos aprendidos (Fornecedor + Despesa) | auto-id |
| `CP_Beneficios_PJ` | Benefícios de PJs (custo de folha) | docId determinístico (idempotência ETL) |
| `CP_Base_Despesas` | Banco de despesas | slug normalizado |
| `CP_Gestores` | Responsáveis por Centro de Custo | auto-id |
| `CP_SolicitacoesAprovacao` | Esteira de aprovação (Fase 3) | auto-id (`status`) |
| `RegrasConciliacao` | De-Para do ETL (Fornecedor+Despesa → Classificação) | auto-id |
| `AreasContasPagar` | Áreas internas do módulo CP | auto-id |
| `Base_Centros_Custo` | Dimensão mestra de CCs (RBAC nível 3) | auto-id (`nome`) |
| `Base_Empresas` | Dimensão de empresas alocáveis | auto-id (`nome`) |

**Convenção de nomenclatura:** `Base_*` = dimensões mestras; `CP_*` = domínio Contas a Pagar / Custo de Folha; sem prefixo = coleções transacionais legadas (`Lancamentos`, `ContasAPagar`).

### 1.3 Estrutura do Documento `Usuarios`

Fonte: [master.html:2170-2292](master.html#L2170-L2292) (criação) e [login.html:479-553](login.html#L479-L553) (carga pós-login).

```javascript
{
  nome: string,
  email: string,                                  // PK (lowercase)
  auth_uid: string | null,                        // null para provedor google até 1º login
  provedor: 'google' | 'password',                // chaveia o fluxo de provisionamento
  perfil: 'super_admin' | 'master' | 'comum',

  permissoes: {
    menus: {                                       // Nível 1 — menus laterais
      dashboardGeral, metasFinanceiras, faturamento,
      gerenciadorContasPagar, custoFolha, aprovacoes,
      configuracoesPrivacidade                     // super_admin only
    },
    modulosDashboard: {                            // Nível 2 — cards do Dashboard Geral
      moduloFaturamento, fluxoCaixa, forecast,
      aging, metas, custoFolha
    },
    filtros: {
      centrosCusto: string[]                       // Nível 3 — restrição por CC (vazio = global)
    }
  },

  menus_permitidos: string[],                      // array legado (back-compat)
  status: 'ativo' | 'inativo',
  data_criacao: Timestamp,
  is_online: boolean,                              // presença (heartbeat 4 min)
  ultimo_acesso: Timestamp
}
```

**RBAC em 3 níveis:**
1. **Menus laterais** ([master.html:1666-1826](master.html#L1666-L1826), `MENUS_DEF`).
2. **Módulos do Dashboard Geral** (`MODULOS_DEF`, visíveis só se `dashboardGeral=true`).
3. **Filtros por Centro de Custo** (`permissoes.filtros.centrosCusto`) — array vazio = sem restrição. Aplicado **apenas na Folha**; Faturamento é sempre global.

### 1.4 Fluxo de Identidade (IAM)

#### Chaveamento por provedor (flag Google ON/OFF)

A flag visual é o checkbox `cad-google-auth` ([master.html:2125-2140](master.html#L2125-L2140)). A função `sincronizarProvedorCad()` esconde/limpa o campo de senha quando o Google está ativo:

```javascript
function sincronizarProvedorCad() {
    const usaGoogle = !!(cadGoogleAuth && cadGoogleAuth.checked);
    if (blocoSenhaCad) blocoSenhaCad.classList.toggle('hidden', usaGoogle);
    if (cadInputSenha) {
        cadInputSenha.required = !usaGoogle;   // senha não-obrigatória com Google
        cadInputSenha.disabled = usaGoogle;
        if (usaGoogle) cadInputSenha.value = '';
    }
}
```

**Provisionamento da credencial** ([master.html:1565-1586](master.html#L1565-L1586), [master.html:2226-2235](master.html#L2226-L2235)):

| Provedor | Como nasce a credencial | `auth_uid` no Firestore | Senha |
|----------|-------------------------|-------------------------|-------|
| `password` | `createUserWithEmailAndPassword` numa **instância secundária** do Auth (`initializeApp(config, 'provisionador-usuarios')`), seguido de `signOut()` + `deleteApp()` para não derrubar a sessão do admin | uid retornado | gravada **somente** no Firebase Auth, nunca no Firestore |
| `google` | Não cria nada no cadastro; a credencial nasce no 1º `signInWithPopup` | `null` até o 1º login | nenhuma |

```javascript
let uid = null;
if (provedor === 'password') {
    uid = await provisionarCredencialAuth(email, senhaProvisoria);  // instância secundária
}
// 'google' → uid permanece null
```

#### Acoplamento de `sendPasswordResetEmail`

O reset de senha está acoplado ao fluxo de **provedor `password`** (não há reset para Google — a credencial é gerida pelo Google). O método dispara via `sendPasswordResetEmail(auth, email)` a partir da tela de login/gestão, sempre chaveado pelo e-mail (PK do documento). Ver memória [[project_auth_flexivel_provedor]].

#### Roteamento pós-login

`rotearAposLogin(user)` ([login.html:437-553](login.html#L437-L553)):
1. `carregarDocUsuario` — resolve por e-mail, com **auto-migração** de docs legados chaveados por `uid` ([login.html:480-498](login.html#L480-L498)).
2. Validações: doc inexistente / status inativo / zero permissões → `signOut()`.
3. Marca presença (`is_online`, `HistoricoAcessos`).
4. `rotaPorPermissoes` redireciona por hierarquia de menu.

---

## 🔬 2. Engenharia de Pipelines e Tratamento de Regras (ETL / Regra do Brendon)

### 2.1 Regra de Sinais e Exportação — Regra do Brendon

**Contexto:** o caso *Brendon Costa Vital* revelou que lançamentos **negativos** (ex.: Contribuição ao Sindicato `−R$ 141,20`) eram descartados por uma regra antiga de allowlist seletiva (só positivos + FGTS). A regra foi **revogada e extinta** em 2026-05-29 (V4 — "Fim do Expurgo").

**Onde opera:** [gerenciador_contas_pagar_desktop/code.html:2726-2737](gerenciador_contas_pagar_desktop/code.html#L2726-L2737).

```javascript
// Auditoria 2026-05-29 V4 (Fim do Expurgo — governança contábil):
// Revogada e EXTINTA a regra anterior que descartava lançamentos
// negativos com allowlist seletiva (FGTS)...
if (codigoAtual == null) { stats.semCabecalho++; continue; }
if (!isFinite(valor) || valor === 0) { stats.ignoradas++; continue; }
if (valor < 0) stats.deducoesAplicadas++;   // aceita 100% dos negativos, preserva o sinal
```

**Não há `Math.max(0, valor)` neste caminho** — o sinal é preservado nativamente (tipo `Number`) e a dedução algébrica pura (`total += v`) é aplicada em `atualizarKPIs()`.

> **⚠️ DIVERGÊNCIA (#3):** A remoção do clamp ocorreu **no ETL de Contas a Pagar**, não no export de benefícios. No módulo de folha ([custo_folha_desktop/code.html:4280-4326](custo_folha_desktop/code.html#L4280-L4326)) o `Math.max(0, tot - vt - vr - am)` **ainda existe** nas funções `_decomporBeneficiosCLT` / `_decomporDescontosCLT`, mas seu papel é apenas evitar resíduo negativo de arredondamento na decomposição VT/VR/AM/Outros — não interfere no valor algébrico total. Preservar essa distinção é importante: o "Brendon" foi resolvido no CP, e o `Math.max` remanescente na folha é benigno.

### 2.2 Exceção da Verba "000"

> **⚠️ DIVERGÊNCIA (#2):** **Não existe interceptação literal do código `"000"`** no pipeline atual. O comportamento real é em duas camadas:

**Camada 1 — Parser TXT analítico** ([custo_folha_desktop/code.html:1476-1494](custo_folha_desktop/code.html#L1476-L1494), [custo_folha_desktop/code.html:1620-1658](custo_folha_desktop/code.html#L1620-L1658)):

```javascript
const _FOLHA_COD_VT  = '276';   const _FOLHA_COD_DESC_VT  = '672';
const _FOLHA_COD_VR  = '277';   const _FOLHA_COD_DESC_VR  = '773';
const _FOLHA_COD_VA  = '284';   const _FOLHA_COD_DESC_VA  = '776';
const _FOLHA_COD_MED = '279';   const _FOLHA_COD_DESC_MED = '774';
const _FOLHA_COD_ODONTO = '281';const _FOLHA_COD_DESC_ODONTO = '775';
```

O parser reconhece **apenas estes 10 códigos** via cadeia `if / else if`. Qualquer código fora dessa lista (incluindo `"000"`) **cai no `else` implícito e é descartado** — não é roteado para "Outros" no TXT.

**Camada 2 — Classificador dinâmico do Modal Olho / Export** ([custo_folha_desktop/code.html:2166](custo_folha_desktop/code.html#L2166), [custo_folha_desktop/code.html:3640-3647](custo_folha_desktop/code.html#L3640-L3647)): qualquer **chave numérica** que não case com os 5 buckets contábeis (Vencimentos / Encargos / Benefícios / Descontos Bnf / Descontos Folha) é classificada como `outros_valores`:

```javascript
// D) Amber — só o que sobrou E é número (dinheiro não mapeado).
return 'outros_valores';
```

**Badge de aviso visual** ([custo_folha_desktop/code.html:3830-3831](custo_folha_desktop/code.html#L3830-L3831)): a seção é renderizada com ícone `help` âmbar (`text-amber-500`):

```javascript
secao('Outros valores importados', 'help', 'text-amber-500', grupos.outros_valores,
      ` <span class="normal-case text-slate-400 font-normal">— não mapeados no cálculo</span>`)
```

A seção só aparece se houver itens (`if (!items.length) return ''`), funcionando como **alerta visual** de que entraram verbas fora do mapa contábil conhecido.

**Export Completo** (2026-06-01 — "Extinção do Outros", diretriz Controladoria, [custo_folha_desktop/code.html:4440-4495](custo_folha_desktop/code.html#L4440-L4495)): o export deixou de consolidar resíduo em "Outros" — **cada rubrica vira uma coluna nomeada própria** (prefixo `(~)` para não mapeadas), garantindo abertura analítica absoluta.

### 2.3 Fallback de Faturamento Real

**Motor:** [core_rules.js:113-126](core_rules.js#L113-L126) — `calcularFaturamentoReal(descricaoContrato, valorFatura, valorTaxa)`.

```javascript
function calcularFaturamentoReal(descricaoContrato, valorFatura, valorTaxa) {
  const desc = String(descricaoContrato || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // strip de acentos
    .trim().toUpperCase();
  const taxa = Number(valorTaxa) || 0;
  const grupo1 = ["TEMPORARIO","ESTAGIO","TERCEIROS","FOPAG","CONSULTORIA","RPO"];
  const grupo2 = ["TREINAMENTO","PROCESSAMENTO DE PPA","SUBSCRIPTION","HR METRICS",
                  "INTEGRACAO","UNIDADES","DEVOLUTIVA","ASSESSMENT","HOTMART"];
  if (grupo1.some(g => desc.includes(g))) return taxa;          // 100% da Taxa
  if (grupo2.some(g => desc.includes(g))) return taxa * 0.55;   // 55% da Taxa (Serviços NEAT)
  return 0;                                                      // fallback geral = 0
}
```

> **⚠️ DIVERGÊNCIA (#1):** A narrativa "Consultoria = Bruto − Impostos com fallback no Bruto" **não corresponde ao código**. O motor é **100% baseado em Taxa**:
> - **Grupo A (100% Taxa):** TEMPORARIO, ESTAGIO, TERCEIROS, FOPAG, **CONSULTORIA**, RPO.
> - **Grupo B (55% Taxa — Serviços NEAT):** TREINAMENTO, PROCESSAMENTO DE PPA, SUBSCRIPTION, HR METRICS, INTEGRACAO, UNIDADES, DEVOLUTIVA, ASSESSMENT, HOTMART.
>
> Não há subtração de impostos nem fallback no Bruto em parte alguma do cálculo de Faturamento Real. O campo `valorFatura` (Bruto) é recebido como parâmetro mas **não é usado** no retorno.

**Por que a RPS 13016 computa zero:** a nota é do **Grupo A (Terceiros/Consultoria)**, cujo Faturamento Real = `taxa`. Como `const taxa = Number(valorTaxa) || 0`, uma **Taxa zerada de origem** produz `return taxa` = **0**, sem qualquer recuperação compensatória. Não é bug do motor — é a Taxa ausente na fonte. Ferramenta de diagnóstico: [diag_crf_notas.cjs](diag_crf_notas.cjs) (inspeciona os campos crus `taxa`/`Taxa`/`Vl. Taxa`/`faturamento_real_manual`).

**Override manual (prioridade máxima):** `obterFaturamentoReal(data)` ([core_rules.js:142-153](core_rules.js#L142-L153)) honra `faturamento_real_manual` antes do cálculo automático. UI em [contas_a_receber_desktop/code.html:685-692](contas_a_receber_desktop/code.html#L685-L692) com badge **Override**, persistido como `null` quando em branco (volta ao cálculo automático). Indicador Manual/Auto em [contas_a_receber_desktop/code.html:1574-1576](contas_a_receber_desktop/code.html#L1574-L1576).

**Empresa atribuída (acoplada):** `calcularEmpresaAtribuida(tipoServico)` ([core_rules.js:92-111](core_rules.js#L92-L111)) — TEMPORARIO→`SOULAN CONSULTORIA`, ESTAGIO→`ESTÁGIO`, {TERCEIROS,FOPAG,CONSULTORIA,RPO}→`SOULAN ADM`, Grupo NEAT→`NEAT`. Usa strip de acento NFD (fix do bug ESTÁGIO em 2026-06-19, ver [[project_empresa_derivada_faturamento]]).

---

## 🔬 3. Modelagem Relacional de Dashboards e Interfaces

> Arquivo de referência: [custo_folha_dash/code.html](custo_folha_dash/code.html) (gráficos) e [gerenciador_contas_pagar_desktop/code.html](gerenciador_contas_pagar_desktop/code.html) (paginação). Lógica de lookup espelhada em [custo_folha_desktop/code.html](custo_folha_desktop/code.html).

### 3.1 Vínculo de PJs Dinâmico (Join em memória)

`_pjEmpresaPorFornecedor(codForn, dataLanc)` ([custo_folha_dash/code.html:1900-1922](custo_folha_dash/code.html#L1900-L1922)) faz um **join em memória** contra três caches sincronizados da base de Fornecedores (CP), em cascata de 4 níveis até descobrir a **empresa-mãe real** do PJ:

```javascript
function _pjEmpresaPorFornecedor(codForn, dataLanc) {
    const _norm = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().trim();
    const _digitos = s => String(s||'').replace(/\D/g,'');
    let emp = '';
    // 1) por código do fornecedor (chave relacional primária)
    if (codForn != null && _cacheFornEmpresa.has(String(codForn)))
        emp = _cacheFornEmpresa.get(String(codForn));
    // 2) por CNPJ/CPF do profissional
    if (!emp && dataLanc) {
        const doc = _digitos(dataLanc.cnpj || dataLanc.cpf || dataLanc.cnpj_cpf || dataLanc.documento);
        if (doc && _cacheFornEmpresaPorDoc.has(doc)) emp = _cacheFornEmpresaPorDoc.get(doc);
    }
    // 3) por nome normalizado (entidade/favorecido)
    if (!emp && dataLanc) {
        const nm = _norm(dataLanc.entidade || dataLanc.favorecido || dataLanc.nome);
        if (nm && _cacheFornEmpresaPorNome.has(nm)) emp = _cacheFornEmpresaPorNome.get(nm);
    }
    // 4) fallback: empresa do lançamento; senão principal. Nunca 'PJ'.
    if (!emp && dataLanc && dataLanc.empresa) emp = String(dataLanc.empresa);
    emp = _folhaEmpresaCanonica(emp);
    return emp || 'SOULAN CONSULTORIA';
}
```

**Caches** (mantidos por listener contínuo sobre Fornecedores):
- `_cacheFornEmpresa`: `código_fornecedor → empresa`
- `_cacheFornEmpresaPorDoc`: `dígitos do CNPJ/CPF → empresa`
- `_cacheFornEmpresaPorNome`: `nome normalizado (NFD) → empresa`

**Exemplo de negócio:** "Campos Girassol" (PJ) com código mapeado em Fornecedores → resolve para **`NEAT`**, em vez de cair numa barra genérica `"PJ"`. O fallback final retorna `SOULAN CONSULTORIA` (nunca a sentinela `PJ`), **extinguindo a barra genérica** no gráfico. Ver [[project_fase3_conector_cc]].

### 3.2 Normalização de Empresas

`_folhaEmpresaCanonica(empresaRaw)` ([custo_folha_dash/code.html:1931-1938](custo_folha_dash/code.html#L1931-L1938)):

```javascript
function _folhaEmpresaCanonica(empresaRaw) {
    let emp = String(empresaRaw || '').trim();
    if (!emp) return emp;
    const cmp = emp.toUpperCase().replace(/\s+/g, ' ').trim();
    if (cmp === 'SOULAN CONSULTORIA 3') return 'SOULAN CONSULTORIA';   // regra dura, igualdade exata
    if (cmp === EMPRESA_PJ_SENTINELA)   return 'SOULAN CONSULTORIA';   // guarda anti-'PJ'
    return emp;
}
```

- Colapsa espaços múltiplos (`\s+ → ' '`) e compara em uppercase.
- `"SOULAN CONSULTORIA 3"` → agrupado **estritamente** em `"SOULAN CONSULTORIA"` por igualdade exata (não afeta `"NEAT 3"` ou outras variações).
- Sentinela `'PJ'` (`EMPRESA_PJ_SENTINELA`) também é absorvida em `SOULAN CONSULTORIA`, reforçando a extinção da barra genérica.

### 3.3 Geometria e Layout dos Gráficos (ApexCharts)

| Gráfico | Altura | Largura de barra | Empilhamento | Linha aprox. |
|---------|--------|------------------|--------------|--------------|
| Evolução mensal (Vencimentos/Encargos/Benefícios) | `height: 380` | `columnWidth: '70%'` | **`stacked: false`** | [1360](custo_folha_dash/code.html#L1360), [1371](custo_folha_dash/code.html#L1371) |
| Custo Total mensal | — | `columnWidth: '45%'` | — | [1330](custo_folha_dash/code.html#L1330) |
| Custo por Empresa | `height: 380` | `columnWidth: '55%'` (`distributed: true`) | — | [1490](custo_folha_dash/code.html#L1490), [1498](custo_folha_dash/code.html#L1498) |
| Centro de Custo (horizontal) | — | `barHeight: '78%'` | — | [1539](custo_folha_dash/code.html#L1539) |

```javascript
chart: {
    type: 'bar',
    stacked: false,   // ← Benefícios DESEMPILHADO (barras agrupadas lado a lado)
    height: 380,      // ← altura fixa
    toolbar: { show: false },
}
plotOptions: { bar: { borderRadius: 4, columnWidth: '70%', borderRadiusApplication: 'end' } }
```

O contêiner HTML do gráfico de empresas reforça a altura via classe Tailwind `h-[380px]`. O **desempilhamento** (`stacked: false`) garante que a faixa de Benefícios não fique esmagada no topo de uma pilha — as três séries aparecem agrupadas e legíveis.

### 3.4 Carga Paginada no Contas a Pagar

`_cpContarDocsPorHash(hash)` ([gerenciador_contas_pagar_desktop/code.html:3335-3353](gerenciador_contas_pagar_desktop/code.html#L3335-L3353)) usa `.limit(50)` para detectar reimportação de arquivo (mesmo `arquivo_hash`):

```javascript
const q = query(
    collection(db, COLECAO),
    where('arquivo_hash', '==', hash),
    limit(50)                       // contagem sensível até 50; acima vira "50+"
);
const snap = await getDocs(q);
return snap.size;                   // fail-open: erro → 0 (não trava o operador)
```

**Observação de arquitetura:** o módulo **não usa `startAfter` para paginação clássica** (next/prev page). O padrão real é:
- **Micro-paginação:** `.limit(50)` apenas para contagem-teto na detecção de duplicidade.
- **Sincronização:** `onSnapshot` mantém os dados visíveis atualizados em tempo real; filtros/busca são client-side em memória.

> **Nota:** caso a base de Contas a Pagar cresça a ponto de o carregamento em memória pesar, este é o ponto natural para introduzir cursores `startAfter` reais — hoje ausentes por design.

---

## 📎 Apêndice — Índice de Arquivos-Chave

| Arquivo | Papel |
|---------|-------|
| [core_rules.js](core_rules.js) | Motor de faturamento, parsers de moeda, empresa atribuída (SSOT) |
| [login.html](login.html) | Bootstrap Firebase, sign-in (e-mail/Google), roteamento e auto-migração |
| [master.html](master.html) | Gestão de usuários, provisionamento de credencial, matriz RBAC |
| [sidebar.js](sidebar.js) | Sidebar, presença (heartbeat), guard de inatividade |
| [contas_a_receber_desktop/code.html](contas_a_receber_desktop/code.html) | Faturamento — UI, override manual, KPIs |
| [custo_folha_desktop/code.html](custo_folha_desktop/code.html) | Folha — ETL TXT, Modal Olho, export analítico |
| [custo_folha_dash/code.html](custo_folha_dash/code.html) | Dashboard de Folha — join de PJs, normalização, gráficos |
| [gerenciador_contas_pagar_desktop/code.html](gerenciador_contas_pagar_desktop/code.html) | Contas a Pagar — ETL, Regra do Brendon, dedup por hash |
| [diag_crf_notas.cjs](diag_crf_notas.cjs) | Diagnóstico de notas CRF (RPS 13016 etc.) |

---

*Documento gerado por levantamento direto do código-fonte. Números de linha são aproximados e devem ser reconfirmados antes de refatorações sensíveis. Nenhum deploy foi realizado na geração deste documento.*
