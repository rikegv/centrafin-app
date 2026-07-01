# Diario do Projeto - CentraFin

Registro vivo de decisoes e progresso. Entradas mais recentes no topo.
Mantido pelo coordenador a cada tarefa concluida ou decisao tomada.

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
