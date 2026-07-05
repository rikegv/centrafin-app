# Diario do Projeto - CentraFin

Registro vivo de decisoes e progresso. Entradas mais recentes no topo.
Mantido pelo coordenador a cada tarefa concluida ou decisao tomada.

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
