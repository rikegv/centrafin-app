# Diario do Projeto - CentraFin

Registro vivo de decisoes e progresso. Entradas mais recentes no topo.
Mantido pelo coordenador a cada tarefa concluida ou decisao tomada.

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

