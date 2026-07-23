# Diario do Projeto - CentraFin

Registro vivo de decisoes e progresso. Entradas mais recentes no topo.
Mantido pelo coordenador a cada tarefa concluida ou decisao tomada.

---

## 2026-07-23 — Sessão completa: Importação 2025, Timezone, Folha Blocos A–D, Fonte Única

### 1. Importação da base 2025 (OS-IMPORT-ROBUSTEZ-01, commit 9c0b908)

**Problema:** Importação parcial — 3.639 de 5.639 registros entraram, faltando R$ 7.360.360,61.
Causa raiz: `addDoc` gera ID no cliente; numa operação longa (5.639 escritas sequenciais),
retry do SDK após resposta de rede perdida reenviou o mesmo ID → "Document already exists" →
loop abortou sem tolerância a falha, deixando importação parcial silenciosa.

**Correção:** writeBatch com chunks de 450 (usa `batch.set`, não `batch.create` — retry
sobrescreve silenciosamente em vez de falhar). Tolerância a falha por lote (cada
`batch.commit` tem try/catch individual — lote que falha registra NFs afetadas e continua).
Relatório final obrigatório (criados/atualizados/falhados + lista de NFs com erro).
Indicador de progresso ("Criando lote X de Y — Z de N"). Dedup por nf+cnpj preservada
intacta.

**Resultado em produção:** 2.000 criados, 3.639 atualizados, 0 falhados. Base 2025 fechada
em 5.639 docs / R$ 94.799.626,63.

**Números de referência auditados (base 2025):**
- Total: 5.639 docs, R$ 94.799.626,63 (Valor Fatura)
- Jan 722 / Fev 588 / Mar 497 / Abr 433 / Mai 430 / Jun 380 / Jul 365 / Ago 400 /
  Set 427 / Out 423 / Nov 404 / Dez 570

---

### 2. Bug de timezone na conversão de data (OS-CRF-DATA-TIMEZONE-01, commit f92aea2)

**Problema:** 6 conversões inline de serial Excel no CRF usavam
`new Date((serial - 25569) * 86400 * 1000)`, criando Date em UTC midnight. No fuso de
Brasília (UTC-3), `getMonth()`/`getDate()` retornavam o dia/mês ANTERIOR para notas
emitidas no dia 1º.

- 1 função quebrada de fato: `parseDataAuditoria` — 90 notas de 2025 e 81 de 2026
  (R$ 737.386,86) apareciam no mês errado no relatório de auditoria.
- 5 funções "funcionavam por acaso" — usavam `.toISOString()`/`.getTime()` logo depois,
  que anulavam o erro por coincidência. Bomba-relógio: bastaria trocar por `.getMonth()`
  numa refatoração futura para o bug ressurgir.

**Correção:** Todas as 6 substituídas por `parseDataLocal`/`extrairISOLocal` do core_rules.js
(que usam `getUTCFullYear`/`getUTCMonth`/`getUTCDate` — imunes a timezone). 72 linhas
removidas, 14 inseridas. Dashboard Master e DRE Gerencial não afetados (já usavam métodos
corretos).

---

### 3. Auditoria de Folha — Blocos A/B/C/D (merges 7691a2e, f43c2c8, daebefe)

- **Bloco A:** Removida mensagem "informativo, não entra no Custo Total"; rótulo simplificado
  para "Descontos". Regra permanente registrada: as 5 verbas investigadas (INSS retido, IRRF,
  Contribuição Assistencial, Seguro de Vida, Contribuição Odontológica) já estão embutidas no
  Salário Bruto — somá-las seria DUPLA CONTAGEM.
- **Bloco B:** DIFERENCA_SALARIAL reclassificada de "outros valores" para Vencimentos
  (keyword `DIFERENCA` adicionada ao `isVencimento`).
- **Bloco C:** Seção "Exame Médico" adicionada ao modal Olho do Gerenciador. Conflito de
  merge com bloco A resolvido (rótulo "Descontos" do A + seção "Exame Médico" do C).
- **Bloco D:** Selo de build debug removido do Dashboard de Custo de Folha.

---

### 4. Fonte Única de cálculo de folha (commits d3b77fa, fe713c5, 87ac299, b9e84f4)

**Problema:** Gerenciador e Dashboard tinham implementações SEPARADAS da mesma regra de
cálculo de custo de folha, que divergiram ao longo do tempo. Resolvido em 3 camadas
sucessivas, cada uma revelando a próxima:

**(a) Fórmula de cálculo (OS-FOLHA-FONTE-UNICA-01, d3b77fa):**
Classificadores (isVencimento, isEncargo, isDescFolhaInfo, isBnfDesc, isSalarioBrutoKey) e
`calcularTotais` extraídos do Gerenciador para `core_rules.js` como funções `folhaCusto*`.
Ambos os módulos passaram a delegar. Divergências corrigidas no Dashboard: faltavam
`BOLSA_AUXILIO`, `DIFERENCA`, `SALARIO_CADASTRAL` rejection, 3 itens informativos em
isDescFolhaInfo, e a guarda `_has_benef_txt` (TXT como fonte de verdade para benefícios).

**(b) Atribuição de empresa dos PJs (OS-FOLHA-PJ-EMPRESA-01, fe713c5):**
Gerenciador marcava todo PJ como `empresa='PJ'`, normalizado para "SOULAN CONSULTORIA" via
`folhaEmpresaCanonica`. Dashboard resolvia a empresa real via lookup em Fornecedores.
Decisão do diretor: PJ aparece na empresa real. Impacto medido: SOULAN CONSULTORIA
desinflou R$ 753.673,73; NEAT ganhou R$ 650.221,74; SOULAN ADM ganhou R$ 103.451,99.
Total global inalterado (R$ 0,00 de diferença). Funções extraídas: `folhaPjResolverEmpresa`,
`folhaEmpresaCanonica`, `folhaNormalizarCompetenciaPJ`.

**(c) Enriquecimento de benefícios CLT via TXT (b9e84f4):**
O Dashboard não enriquecia CLTs com benefícios do TXT analítico (CP_Beneficios_PJ). A
função `enriquecerCltComBeneficios` e o cache `_cacheBeneficiosPorMatricula` existiam
APENAS no Gerenciador. Dashboard subestimava benefícios em R$ 67.258,97 e descontos em
R$ 1.587,87 (gap de R$ 68.846,84 no Custo Total para NEAT). Extraídos para core_rules.js:
`folhaEnriquecerCltComBeneficios`, `folhaMontarCacheBeneficiosPJ`.

**Incidente durante o processo (hotfix 87ac299):**
Deploy quebrou o Gerenciador em produção ("ReferenceError: folhaCustoIsVencimento is not
defined") porque a tag `<script src="core_rules.js">` foi adicionada ao Dashboard mas
esquecida no Gerenciador. Tela em branco por ~10 minutos até o hotfix.

---

### Aprendizados (REGRAS PERMANENTES)

1. **Ao extrair lógica para módulo compartilhado, verificar que TODOS os módulos consumidores
   têm a tag de import.** A ausência só aparece em runtime — não há typecheck nem build step
   neste projeto. Checklist pós-extração: `grep -r "folha*" *.html` confirma uso; confirmar
   que cada HTML que usa tem `<script src="core_rules.js">`.

2. **Divergência entre dois módulos raramente tem causa única.** Unificar a fórmula não basta
   se a ORIGEM DOS DADOS (merges, caches, enriquecimentos) continuar duplicada. Verificar as
   três camadas: (a) fórmula de cálculo, (b) conjunto de registros (PJs, filtros), (c)
   enriquecimento pré-cálculo (benefícios TXT).

3. **Nunca "portar" (copiar) uma função para outro módulo como solução de divergência.** Isso
   recria a causa raiz — em poucos meses as duas implementações divergem de novo. Sempre
   extrair para local comum (core_rules.js) e ambos os módulos chamam a mesma função.

4. **Operações de escrita em massa (importação) exigem batch + tolerância a falha + relatório
   final.** Loop sequencial sem isso produz falha parcial silenciosa — o usuário não sabe o
   que entrou e o que faltou. writeBatch + try/catch por lote + contadores ao final.

---

### Resumo técnico da sessão

| OS | Commit(s) | Arquivo principal | Saldo |
|----|-----------|-------------------|-------|
| IMPORT-ROBUSTEZ-01 | 9c0b908 | contas_a_receber_desktop/code.html | +175 -35 |
| CRF-DATA-TIMEZONE-01 | f92aea2 | contas_a_receber_desktop/code.html | +14 -72 |
| FOLHA Blocos A–D | 7691a2e, f43c2c8, daebefe | custo_folha_desktop, custo_folha_dash | merge de 3 branches |
| FOLHA-FONTE-UNICA-01 | d3b77fa | core_rules.js, custo_folha_desktop, custo_folha_dash | +285 -553 |
| FOLHA-PJ-EMPRESA-01 | fe713c5 | core_rules.js, custo_folha_desktop, custo_folha_dash | +90 -69 |
| Hotfix script tag | 87ac299 | custo_folha_desktop/code.html | +1 |
| Benefícios CLT TXT | b9e84f4 | core_rules.js, custo_folha_desktop, custo_folha_dash | +114 -176 |

---

## 2026-07-23 — OS-IMPORT-ROBUSTEZ-01: Importação de Lancamentos resiliente (entrada original)

### Status: CONCLUÍDO — deployado e validado em produção.

### Causa raiz do problema
Importação da base 2025 de Contas a Receber falhou após 3.639 de 5.639 registros.
Loop sequencial de `addDoc` individuais sofria retry do SDK Firebase em perda de rede
→ "Document already exists" → abortava tudo, deixando 2.000 registros faltantes
(R$ 7.360.360,61).

### O que foi implementado (branch `feature/import-robustez`)
1. **writeBatch com lotes de 450** — substitui loop sequencial de addDoc/updateDoc.
   Usa `doc(collection(db, "Lancamentos"))` para IDs aleatórios client-side (equivalente
   funcional a addDoc, sem risco de duplicar docs existentes com IDs determinísticos).
2. **Tolerância a falha por lote** — try/catch individual por batch.commit(). Lote que
   falha registra docs falhados e continua com o próximo. Não aborta.
3. **Indicador de progresso** — botão mostra "Criando/Atualizando lote X de Y — Z de N".
4. **Relatório final** — modal de sucesso expandido com cards (Criados/Atualizados/Falhados)
   + lista de NFs com motivo de falha (até 50, com indicador de overflow).
5. **Dedup INTOCADA** — normChaveDoc, mapExistentes, classificação novos/atualizados
   preservados integralmente.

### Decisão do diretor
- NÃO reimportar até validação completa da robustez.

### Arquivo alterado
- `contas_a_receber_desktop/code.html` — função `processarSalvamentoImportacao` + modal de sucesso.

### Pendências
- Validação visual do diretor (feature com UI).
- Testes com dados reais: (a) 5.639 registros entram; (b) reimportação não duplica; (c) relatório bate.
- Flag READY_OS-IMPORT-ROBUSTEZ-01 após validação.

---

## Pendência — Custo de Folha × Reembolsos de PJ Interno (registrada 2026-07-17)

**Status: PENDENTE — aguarda solicitação explícita do diretor para implementar.**

Lançamentos de REEMBOLSO feitos a PJs internos (vindos do módulo Contas a Pagar) NÃO
devem entrar no custo de folha. Reembolso (Uber, almoço com cliente, compras adiantadas)
é devolução de dinheiro que o PJ adiantou — não é custo de pessoal/remuneração. Só deve
entrar no custo de folha a nota de serviço/remuneração do PJ.

### A definir antes da implementação

Como o sistema distingue um lançamento de "reembolso" de uma "nota de serviço" do PJ:
campo específico, categoria, palavra na descrição, ou se precisará de marcação nova. Essa
definição determina se é correção simples de filtro ou mudança estrutural.

---

## 2026-07-16 — OS-FOLHA-CUSTO-REAL-01 (Bloco A): Composição do custo de folha — investigação e transparência

### Decisão do diretor

Investigação completa sobre a composição do custo de folha para determinar se verbas
marcadas como "informativo" (INSS retido, IRRF, Contribuição Assistencial, Seguro de
Vida, Contribuição Odontológica) deviam ser adicionadas ao custo total.

### Conclusão comprovada aritmeticamente (REGRA PERMANENTE — protege contra dupla contagem)

Todas as 5 verbas investigadas **JÁ ESTÃO EMBUTIDAS no Salário Bruto / Vencimentos**:
- **INSS retido** (`INSS_Valor`) — retenção do funcionário, incluída no bruto
- **IRRF retido** (`IRRF_Valor`, `IR_RETIDO_Valor`) — retenção do funcionário, incluída no bruto
- **Contribuição Assistencial** (`CONTRIBUICAO_ASSISTENCIAL_Valor`) — desconto sindical do funcionário, incluído no bruto
- **Seguro de Vida** (`SEGURO_DE_VIDA_Valor`) — coparticipação do funcionário, incluída no bruto
- **Contribuição Odontológica** (`DESCONTO_CONTRIBUICAO_ODONTOLOGICA_Valor`) — coparticipação do funcionário, incluída no bruto

**Prova**: `TOTAL_VECTO − TOTAL_DESCTO = LIQUIDO` com gap zero em todos os funcionários
testados (Beatriz Martins Romao, Débora Santos Gomes, Caio Monteiro). As 5 verbas compõem
o `TOTAL_DESCTO` — são deduzidas do bruto para chegar ao líquido.

**Consequência**: somá-las ao custo total causaria **DUPLA CONTAGEM** (o bruto já as contém).
O cálculo atual (`calcularTotais()`: vencimentos + encargos + benefícios − descontos_bnf)
está algebricamente correto.

**Qualquer futura alteração que pretenda "adicionar descontos ao custo total" deve ser
rejeitada**, salvo prova de que a natureza da verba mudou (passou a ser custo adicional
pago pela empresa por cima do salário, não desconto do funcionário).

### O que foi implementado

1. Rótulo da seção "Descontos de Folha" no modal Olho renomeado para "Descontos" — sem
   mensagem explicativa (decisão do diretor: tela limpa).
2. Mensagem "informativo, não entra no Custo Total" removida completamente.
3. **Nenhuma alteração de cálculo** — apenas texto de UI.

### Nota sobre Seguro de Vida e Contribuição Odontológica

Os campos `Bnf_Seguro` e `Bnf_Odonto` (custo bruto do benefício pago pela empresa)
existem na estrutura mas estão zerados em Jun/2026 — dependem de importação de
benefícios PJ (`_origens.beneficios`). Quando preenchidos, esses campos entram
corretamente como "Benefícios Pagos" (bucket separado, sem risco de dupla contagem).

### Contexto de risco

Esta OS opera na mesma área sensível da inflação acidental revertida em `bab45d8`
(dupla contagem de `salario_cadastral`). A investigação em 3 fases com aprovação
do diretor antes de cada etapa foi aplicada para máxima cautela.

---

## 2026-07-10 — OS-APROVACAO-MODAL-02 a 05: Modais de Aprovação — diff, resumo de negócio, campos editáveis

### Contexto e escopo final

Série de 4 OSs (MODAL-02 a 05) cobrindo a tela de Aprovações (`aprovacoes_desktop/code.html`)
e os call sites de captura de dados nos módulos CRF, CP, Folha e Metas.

### O que foi implementado

1. **Badge com nome real da operação** — "PARCELAMENTO", "DESFAZER PARCELAMENTO" em vez do
   genérico "COMPOSTA" (tabela e modal).
2. **Diff real para edições simples (UPDATE)** — tabela "Campo | Valor atual | Alterado para"
   mostrando SOMENTE campos que efetivamente mudaram.
   - Iteração apenas de chaves de `dados_novos` (campo ausente no novo = não tocado).
   - Normalização: `"1800"` (string) = `1800` (number); `null` = `""`.
   - Metadados excluídos: `data_edicao`, `data_importacao`, `created_at`, `updated_at`, `*_timestamp`.
3. **Captura completa de `dados_antigos`** — spread do registro em cache nos 4 módulos, em vez
   de subconjunto manual de 3-5 campos.
4. **Resumo de negócio por tipo de operação composta:**
   - **Parcelamento:** Status Atual (Valor da Fatura + Status) | Tabela de parcelas (Valor + Vencimento).
   - **Desfazer parcelamento:** Status Atual (Status + Parcelas geradas) | Resumo (N excluídas + nota restaurada).
   - **Exclusão em massa (DELETE_BATCH):** formato existente mantido (N registros + lista IDs).
5. **Modal "Realizar Alterações"** — campos editáveis filtrados:
   - UPDATE simples: apenas campos do diff.
   - Parcelamento: apenas Valor + Vencimento por parcela.
   - Desfazer parcelamento / DELETE_BATCH: botão removido (sem campos editáveis).

### Decisão do diretor: `data_edicao` é metadado

`data_edicao` (carimbo automático de salvamento) adicionado a `_isMetadadoTecnico` — muda a
cada edição mas nunca é decisão do usuário. `data_importacao` idem (carimbo do ETL).

### Aprendizado (5+ rodadas até acertar)

**Operações compostas exigem definição explícita de "resumo de negócio" por tipo.** Não é
suficiente generalizar a lógica de diff de edição simples para operações como parcelamento,
desfazer parcelamento ou exclusão em massa — cada tipo tem campos relevantes diferentes,
lógica de exibição diferente, e campos editáveis diferentes (ou nenhum). A abordagem correta
é: (1) propor o resumo de negócio em texto ao diretor, tipo por tipo; (2) obter confirmação
antes de implementar; (3) implementar renderização dedicada, não genérica.

**Evidência antes de tela:** Na OS-MODAL-04 o diretor exigiu prova do cálculo de diff em texto
com dados reais ANTES de qualquer mudança de HTML — isso evitou uma quarta rodada de
"parece certo mas na prática não funciona". Lição: para lógica de transformação de dados,
provar o cálculo com dados reais antes de tocar na interface.

### Commits

- `7d894d7` feat: OS-APROVACAO-MODAL-02 — badge real, card legível, diagnóstico do botão
- `dad23a4` feat: OS-APROVACAO-MODAL-03 — diff real nos modais de aprovação
- `c7218ad` fix: OS-APROVACAO-MODAL-04 — diff definitivo com tabela unificada
- `8f93845` feat: OS-APROVACAO-MODAL-05 — resumo de negócio para operações compostas
- `234e08a` fix: OS-APROVACAO-MODAL-05 — valor fatura no status, modal revisão cirúrgico

---

## 2026-07-08 — Reforço gate-deploy.js: trava de working directory sujo

### Decisão do diretor (2026-07-08)

Motivado pelo deploy fora de sequência da OS-APROVACAO-AJUSTES-02 (código em produção sem commit), o diretor aprovou a adição de um check no `scripts/gate-deploy.js` que bloqueia deploy/push quando há alterações não commitadas (`git status --porcelain`).

### Testes realizados

| Cenário | Resultado | Exit code |
|---------|-----------|-----------|
| Working directory sujo (arquivos modificados/untracked) | **BLOQUEADO** com lista de arquivos pendentes | 2 |
| Working directory limpo (tudo commitado) | **LIBERADO** | 0 |

### Ajuste complementar no .gitignore

Adicionados `.claude/worktrees/` e `.claude/settings.local.json` ao `.gitignore` — são arquivos de sessão local do Claude Code que sujavam o working directory permanentemente, o que impediria deploys legítimos.

---

## 2026-07-08 — OS-APROVACAO-AJUSTES-02: Banner + Data no Parcelamento

### Correções

| Item | Problema | Correção |
|------|----------|----------|
| Banner esteira | Exibido para Master (sidebar.js:238 incluía 'master'), violando regra de discrição | Condição alterada para `perfilN !== 'super_admin'` — Master nunca vê. Título renomeado de "Atenção Master" para "Esteira de Aprovações". Contraste corrigido (text-amber-900/800). |
| Data no parcelamento CRF | Modal de parcelamento não tinha campo de data — datas auto-calculadas sem customização | Novo campo "Data Base de Vencimento" (input type="date") editável, pré-preenchido com vencimento da nota. Preview recalcula ao alterar. |

### Registro de deploy fora de sequência

**Esta OS foi deployada ANTES de ser commitada, por decisão do diretor motivada por dificuldade de acesso ao ambiente local. O deploy em produção ficou temporariamente à frente do git entre 16:05:11 (horário do deploy) e o commit `c9d1711` (horário deste commit).** O diretor autorizou o deploy direto e o alinhamento posterior do repositório. Situação regularizada com commit + push.

### Arquivos alterados
- `sidebar.js` — condição de visibilidade + título + contraste do banner
- `contas_a_receber_desktop/code.html` — campo de data + lógica de override em calcularParcelas/renderPreviewParcelas

---

## 2026-07-04 — Sistema de Aprovações em Dois Níveis

### Decisão do diretor (2026-07-03): enforcement client-side

**RISCO ACEITO E REGISTRADO:** O mecanismo de aprovação (master propõe, super_admin
aprova) é implementado com trava **client-side apenas** (JavaScript da tela). As
`firestore.rules` das coleções de dado real (Lancamentos, ContasAPagar, CustosFolha,
Base_Empresas, MetasFinanceiras) **NÃO foram restringidas** para o perfil master —
ele mantém escrita técnica direta nelas.

Consequência: um usuário Master com conhecimento técnico pode, em teoria, burlar a
esteira de aprovação escrevendo diretamente no Firestore via DevTools, SDK ou
qualquer cliente HTTP autenticado. Esse risco foi **comunicado ao diretor na proposta
arquitetural** (2026-07-03) e **aceito conscientemente**, dado que a alternativa
(Cloud Functions) introduziria dependência e custo novos, exigindo aprovação via Lei
da Decisão. O modelo é consistente com o já aceito na Fase 3 (Esteira de Aprovação
de Fornecedores) para operadores comuns.

Única proteção no banco: `CP_SolicitacoesAprovacao` tem `allow update/delete`
restrito a `isSuperAdmin()` — master NÃO pode auto-aprovar suas próprias
solicitações (isso SIM é enforced no banco).

### OS incluídas neste deploy

| OS | Escopo |
|----|--------|
| OS-SISTEMA-APROVACOES | Interceptores de CRUD para master em 5 módulos (CRF, CP, Folha, Metas, Aprovações); funções isSuperAdmin()/isMaster() em firestore.rules; índice composto; tipos BATCH_COMPOUND e DELETE_BATCH |
| OS-APROVACAO-DISCRICAO-01 | Ocultação total do mecanismo para o master: menu Aprovações oculto, toasts de sucesso idênticos ao fluxo direto |
| OS-APROVACAO-IDENTIFICADOR-01 | Nº NF (e equivalente por módulo) na descrição das solicitações, substituindo o ID interno do Firestore |
| Correção toast exclusão CRF | alertaSucesso dentro de modal fechado → _toastEsteira flutuante |

### Validação visual do diretor (2026-07-04)

- Exclusão individual (CRF): toast de sucesso aparece corretamente ✓
- Parcelamento (CRF): toast de sucesso aparece corretamente ✓
- Menu Aprovações oculto para Master ✓
- Nº da NF exibido corretamente na tela de Aprovações ✓

### Teste de emulador (firestore.rules): 15/15 cenários passaram

---

## 2026-07-03 — Deploy em produção: lote de 10 OS

**URL:** https://centra-fin.web.app
**Timestamp:** 2026-07-03, deploy via `firebase deploy --only hosting`
**Commit range:** aec5c39..66f487b (9 commits, push 797fffd..66f487b)

### OS deployadas neste lote

| OS | Escopo | Validação visual |
|----|--------|-----------------|
| OS-AGING-01 | Tabela Aging de Notas Vencidas no Dashboard Master | Aprovada pelo diretor |
| OS-CONSOLIDADO-01 | Gráfico Consolidado full-width (aba Consolidado) | Aprovada pelo diretor |
| OS-CONSOLIDADO-02 | Reordenação (Consolidado no topo), paleta Por Serviço (azul/verde), rótulos sobrepostos (threshold 5%) | Aprovada pelo diretor |
| OS-METAS-DASH-01 (itens 1,3,5,6) | Gráfico mensal bruto, dataLabels corrigidos, modal "Não Atingida", filtro ampliado | Aprovada pelo diretor |
| OS-METAS-KPI-01 | Cards KPI Meta Anual Bruta/Real na tela Metas | Aprovada pelo diretor |
| OS-CONTRASTE-01 | Cores de dataLabels nos gráficos Meta Anual (branco/cinza por série) | Aprovada pelo diretor |
| OS-CONTRASTE-02 | Overflow de rótulos nos gráficos Meta Anual (textAnchor: end + function colors) | Aprovada pelo diretor |
| OS-METAS-BINARIO-01 | Cards de atingimento mensal binários + modal universal abrirModalDetalheMeta (reverte OS-METAS-PARCIAL-01) | Aprovada pelo diretor |
| Gauges individuais >100% | Remoção do Math.min nos 5 velocímetros de produto (completa OS-METAS-DASH-01 item 4) | Aprovada pelo diretor |

### Notas

- **Aba Consolidado — itens conhecidos entregues:** a reordenação (Consolidado no topo)
  e a paleta do gráfico Por Serviço foram entregues como parte da OS-CONSOLIDADO-02.
  Todos os 3 itens da spec estão em produção.
- **OS-METAS-PARCIAL-01 revertida:** o estado "Parcial" (amber) nos cards mensais foi
  introduzido e revertido na mesma sessão. Decisão do diretor: a classificação binária
  global é a correta (soma vs meta geral). O detalhe por produto vive apenas no modal
  de clique (abrirModalDetalheMeta).
- **Regra permanente adicionada ao CLAUDE.md:** reporte obrigatório de regressões
  corrigidas silenciosamente (decisão do diretor, motivada por regressão no filtro de
  status do modal de metas).
- **Código morto identificado:** funções `abrirModalMetaBatida` e `abrirModalMetaNaoAtingida`
  não são mais chamadas (substituídas por `abrirModalDetalheMeta`). Limpeza pendente
  para sessão futura.
- **Override `border-amber-200` em theme.css:** remanescente da OS-METAS-PARCIAL-01.
  Não causa dano; pode ser removido em limpeza futura ou reaproveitado.

---

## 2026-07-01 - OS-FECHAMENTO-01 concluida (deploy em producao)

Matrizes Comercial x Servico no Dashboard Master > Fechamento publicadas em
https://centra-fin.web.app. Firebase deploy --only hosting executado com sucesso.

Resumo da feature entregue:
- Bug critico corrigido: pivot .bruto agora acumula vFatura (antes usava faturReal,
  fazendo Bruto e Real mostrarem o mesmo numero).
- Soulan: 2 tabelas (Faturamento Bruto + Faturamento Real por Comercial).
- Thomas: 3 tabelas (Faturamento Bruto + Real + Taxa por Comercial).
- Tabelas transpostas "por Servico" removidas. Funcao renderTabelaPorServico removida.
- Novo pivot .taxa para Thomas acumulando campo Taxa (OS-CRF-01).

Correcao de processo aplicada durante esta OS: o testador-auditor criou a flag
READY_os-fechamento-01 ANTES da validacao visual do diretor, violando o fluxo do
CLAUDE.md. Flag removida e recriada somente apos aprovacao visual. Licao: o testador
aprova tecnicamente, mas a flag so e criada DEPOIS da validacao visual do diretor
(para features com UI). Ordem correta: testador aprova -> diretor valida visualmente
-> flag criada -> deployer.

Fluxo exercitado: arquiteto -> designer (spec) -> engenheiro-frontend -> designer
(auditoria) -> testador-auditor -> validacao visual do diretor -> flag -> deployer.

---

## 2026-07-01 - Licao: dependencia de dado vs dependencia de deploy

Correcao de entendimento registrada pelo diretor. A dependencia bloqueante original da
OS-FECHAMENTO-01 presumia que ela precisava aguardar o DEPLOY EM PRODUCAO da OS-CRF-01.
Isso estava errado — a dependencia real era o DADO existir no Firestore, nao a TELA
estar publicada. Como o arquiteto ja havia confirmado que os campos Comercial e Taxa ja
existiam nos documentos reais (ETL ja gravava), a OS-FECHAMENTO-01 poderia ter sido
implementada em paralelo, sem esperar deploy.

Regra geral para mapeamento de dependencias entre OS:
- "Depende do dado existir na fonte" (Firestore) != "depende da tela estar publicada"
  (deploy). Sao coisas diferentes.
- Dependencia de deploy so bloqueia de verdade se a nova OS depender de uma MUDANCA DE
  COMPORTAMENTO da tela ja publicada (ex.: formulario que passa a gravar campo novo), nao
  de LER um campo que ja existe.
- Nas proximas OS, distinguir explicitamente essas duas categorias ao mapear dependencias.

Nenhuma acao retroativa necessaria — apenas registro de aprendizado.

---

## 2026-07-01 - OS-CRF-01 concluida (deploy em producao)

Firebase deploy --only hosting executado com sucesso. OS-CRF-01 em producao em
https://centra-fin.web.app. 591 arquivos enviados, 135 novos uploads.

Resumo da feature entregue:
- Colunas Comercial e Taxa no Gerenciador CRF (Contas a Receber)
- Comercial: exibe nome limpo do comissionado (campo Comissionado 01, sem prefixo numerico)
- Taxa: valor monetario entre Faturamento Bruto e Valor Liquido
- 19 colunas reordenadas, cabecalhos centralizados
- Filtro avancado multi-select por Comercial
- Campo Comercial editavel no modal de edicao
- Comercial e Taxa no modal de detalhe e exportacao Excel

Achado do arquiteto: os campos ja existiam nos 3.410 documentos do Firestore (ETL ja
gravava). Nao foi necessario backfill nem reimportacao — tarefa foi puramente de UI.

Fluxo completo exercitado: arquiteto -> designer (spec) -> engenheiro-frontend ->
designer (auditoria) -> testador-auditor -> validacao visual do diretor -> deployer.

---

## 2026-07-01 - Revogacao da regra do print obrigatorio

Decisao do diretor: remover a obrigatoriedade de captura/armazenamento de screen.png no
modulo para features com UI. A validacao visual do diretor continua como gate obrigatorio
— a mudanca e apenas na forma de evidencia: aprovacao textual do diretor registrada no
DIARIO.md e suficiente, sem necessidade de print anexado ao repositorio.

Motivo: custo de armazenamento acumulado no Git e overhead de processamento de imagem
nao se justificam frente ao ganho de auditoria. Trade-off pesado conscientemente pelo
diretor.

Alteracoes: CLAUDE.md secao "Validacao visual do diretor" (removida exigencia de
screen.png) e Definition of Done (atualizado para refletir aprovacao textual).

Aplicacao retroativa: OS-CRF-01 em andamento beneficiada — validacao visual do diretor
ja dada nesta conversa e suficiente para prosseguir sem print.

---

## 2026-07-01 - OS-CRF-01: Validacao visual aprovada pelo diretor

Diretor abriu o modulo Contas a Receber (Gerenciador CRF) no servidor local
(localhost:5000) e validou visualmente a implementacao:
- Colunas Comercial e Taxa nas posicoes corretas
- Cabecalhos centralizados
- Filtro avancado Comercial funcional
- Campo editavel no modal de edicao
- Detalhe (olho) com Comercial e Taxa

Aprovacao registrada textualmente (conforme nova clausula — sem print obrigatorio).
OS-CRF-01 liberada para merge/deploy.

---

## 2026-07-01 - Merge F0 em main (fabrica em producao)

Branch feature/instalar-fabrica-f0 mesclado em main via fast-forward e push para origin.
Fluxo completo da fabrica exercitado pela primeira vez:

- Testador-auditor: revisou os 18 arquivos do branch, rodou checks de sintaxe e segredos
  (ambos limpos), confirmou que firestore.rules NAO foi alterado (emulador dispensado),
  verificou ausencia de segredos nos commits. Flag READY_instalar-fabrica-f0 criada.
- Deployer: confirmou flag, merge --ff-only (3 commits, 1040 linhas), check de segredos
  pre-push limpo, git push origin main sem --force. Range 8bdf875..f6e0cd0.
- Nenhum firebase deploy necessario (sem mudanca em rules/hosting).

Commits agora em main:
- 47cc83a feat: instala fabrica de agentes no CentraFin (F0-01)
- 48d9b82 feat: completa Fase F0 (F0-02 a F0-07)
- f6e0cd0 docs: registra correcao de protocolo

Fase F0 encerrada. Fabrica operacional em main. Proximo: F1 (primeira tarefa cirurgica).

---

## 2026-07-01 - F0 fechado (substrato seguro completo)

Fabrica instalada e testada de ponta a ponta no branch feature/instalar-fabrica-f0,
sem tocar main/producao. Todos os 7 itens da Fase F0 implementados e PROVADOS na
pratica (nao so escritos):

- F0-01: 8 agentes + CLAUDE.md + TASKS.md + DIARIO.md. settings.json/settings.local.json
  originais preservados (nao sobrescritos).
- F0-02: trava de deploy em Node (scripts/gate-deploy.js). Testada: bloqueia push sem
  flag READY_*, libera com flag, bloqueia deploy de firestore:rules sem flag "regra".
- F0-03: Firebase Emulator Suite local (Firestore + UI). Isolamento comprovado (host
  127.0.0.1, impossivel tocar centra-fin real). Regras reais carregadas e aplicadas
  (bloqueio 403 confirmado num teste sem auth).
- F0-04: scripts/test-firestore-rules.cjs. 4/4 casos passando contra as regras reais:
  admin escreve, consulta bloqueado na escrita, hasMenu libera leitura, sem menu nega.
- F0-05: scripts/check-syntax.cjs. Testado com arquivo JS quebrado de proposito (pegou
  o erro) e com arquivos validos (passou).
- F0-06: scripts/check-secrets.cjs. Corrigido um bug real (o script se autodenunciava
  por conter os proprios padroes de busca como texto) e re-testado limpo/sujo.
- F0-07: purge_parcelas_duplicadas.cjs confirmado isolado em scripts-perigosos/.

Decisoes tomadas nesta sessao:
- Designer redefinido (nao gera prototipo, so spec de diff + auditoria de tokens) -
  fabrica ficou em 8 agentes.
- Emulador local = homologacao (nao projeto Firebase separado, por decisao do diretor
  de nao mudar nada do ambiente atual).

Achado durante a instalacao (fora do escopo da fabrica, resolvido a parte):
- Working tree tinha pendencias nao commitadas com um client_secret real hardcoded em
  2 arquivos (audit_headcount_maio.cjs, diag_crf_notas.cjs). Nunca foi commitado
  (confirmado via git log --all -S). Arquivos tirados do stage e adicionados ao
  .gitignore. Nao precisou rotacionar credencial.

Pendente (nao bloqueia F0, aguarda diretor):
- F0-D1: repo publico vs privado.
- F0-D2: confirmar permissao de deploy do firebase login atual (ja em uso, so registrar).

Proximo passo: commit final do branch, push unico (combinado com o diretor), depois
F1 = primeira tarefa cirurgica real exercitando o fluxo completo ponta a ponta.

---

## 2026-07-01 - F0-D1 e F0-D2 fechados (zero pendencias no F0)

- F0-D1: repositorio ja estava privado (diretor havia liberado temporariamente so para
  leitura inicial da fabrica nesta sessao, depois fechou de volta). Confirmado via teste
  de clone sem credenciais (falhou = privado).
- F0-D2: credenciais do firebase login estavam expiradas (Authentication Error ao rodar
  firebase projects:list). Resolvido com firebase login --reauth. Permissao de deploy
  em centra-fin confirmada via firebase deploy --only hosting --dry-run (sucesso).

Fase F0 encerrada sem nenhuma pendencia em aberto. Proxima etapa: F1 (primeira tarefa
cirurgica real) ou merge do PR feature/instalar-fabrica-f0 -> main, a criterio do diretor.

---

## 2026-07-01 - Correcao de protocolo: devolucao da gestao ao coordenador

O diretor apontou (corretamente) que toda a Fase F0 foi executada por mim (Claude, no
chat, fora do Claude Code) escrevendo arquivos e codigo diretamente - papel que deveria
ser do coordenador (e dos agentes sob ele), nao meu. Isso so foi aceitavel porque a
fabrica ainda nao existia: nao havia coordenador para delegar. Agora que ela esta de pe,
essa excecao acabou.

A partir de agora: qualquer codigo, documento de memoria (CLAUDE.md/TASKS.md/DIARIO.md)
ou artefato sob gestao da fabrica e trabalho do coordenador (via Claude Code), seguindo
o fluxo normal de agentes. Eu (chat) volto ao papel de apoio fora da fabrica - discussao,
planejamento, decisoes de arquitetura antes de existir tarefa - nao de execucao dentro
dela.

Licao para o coordenador registrar como propria: o DIARIO.md e a memoria viva do
PROJETO gerida por VOCE (coordenador). Toda entrada daqui em diante deve ser escrita
por voce mesmo, ao fechar cada tarefa - nao herdada de fora.

---

## Decisoes de arquitetura (fechadas na fase de planejamento)

1. Fabrica instalada no branch feature/instalar-fabrica-f0 (2026-07-01), 8 agentes
   (coordenador, arquiteto, designer redefinido, engenheiro-backend, engenheiro-frontend,
   seguranca, testador-auditor, deployer).
2. Stack protegida: Firebase Hosting + Firestore + Auth, HTML/JS vanilla, projeto centra-fin.
3. Homologacao = Firebase Emulator Suite local (F0-03, pendente).
4. Trava de deploy sera em Node (gate-deploy.js), sem WSL/jq (F0-02, pendente).
5. Scripts perigosos isolados em scripts-perigosos/ (purge_parcelas_duplicadas.cjs).

## Pendencias (aguardando)
- Diretor: decidir repo publico vs privado (F0-D1).
- Diretor: confirmar permissao de deploy do firebase login atual (F0-D2).

## Progresso
- F0-01 em andamento: CLAUDE.md, TASKS.md e 8 agentes instalados. Faltam F0-02 a F0-07.
