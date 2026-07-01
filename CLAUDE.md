# CentraFin — Constituição do Projeto

> Combina a CONFIGURAÇÃO DO PROJETO (Parte A, específica do CentraFin, ancorada no
> estado REAL do repositório `rikegv/centrafin-app`) com as REGRAS DA FÁBRICA
> (Parte B, universais, adaptadas à stack Firebase/HTML).
> Princípio do projeto: **CentraFin está em PRODUÇÃO**. Toda mudança é cirúrgica,
> validada no emulador local antes de qualquer deploy, e nada irreversível roda em
> dados reais sem aprovação explícita do diretor.

---

## PARTE A — Configuração do Projeto (CentraFin)

### O que é
Sistema de engenharia financeira / controladoria da Soulan, em produção em
`centra-fin.web.app` (Firebase Hosting). Cobre Contas a Pagar, Contas a Receber /
Faturamento, Custo de Folha, DRE, Dashboards executivos e gestão de cadastros/acessos.

### Stack obrigatória (arquitetura DECIDIDA — protegida pela Lei da decisão)
- Frontend: **HTML/JS vanilla** multipágina. Shell principal `master.html`; cada módulo
  em sua pasta `*_desktop/code.html`. Compartilhados: `core_rules.js`, `sidebar.js`,
  `theme.css`, `theme_manager.js`, `importacao_folha.js`.
- Backend: **não há servidor de aplicação**. A lógica de acesso/segurança vive
  inteiramente em `firestore.rules`.
- Banco: **Cloud Firestore** (projeto `centra-fin`). Schemaless — **não há migrations**.
- Autenticação: **Firebase Auth** (e-mail/senha, `getAuth`/`signInWithEmailAndPassword`
  em `login.html`).
- Infra/deploy: **Firebase Hosting + Firestore Rules**, projeto `centra-fin`. Deploy via
  `firebase deploy --only hosting,firestore:rules`, executado do desktop do diretor.
- IA: módulo `ai_assistant/` (chatbot + tool schema) embarcado no app.

### Integrações
- Firebase (Hosting, Firestore, Auth) — projeto `centra-fin`. O `apiKey` exposto no
  cliente é identificador público do Firebase, **não é segredo**; a proteção do dado é a
  `firestore.rules`. Trocar de projeto, de provedor de auth ou abrir regra = Lei da decisão.

### Modelo de acesso (a ÚNICA fronteira de segurança — proteger acima de tudo)
- RBAC implementado em `firestore.rules` via lookup em `/Usuarios/{email}.perfil`:
  - `super_admin` / `master` = admin (escrita ampla).
  - perfis comuns liberados por `menus_permitidos` (`hasMenu(...)`).
  - `consulta` = **read-only** (defesa em profundidade: bloqueia qualquer escrita do
    front, auditoria 2026-05-26).
- Coleções sensíveis com leitura restrita por menu (ex.: `Lancamentos`, base do
  Faturamento — restrita em 2026-05-13 por segregação de privilégio).
- **Qualquer alteração em `firestore.rules` é tratada como mudança de segurança**:
  exige teste no emulador (ver Parte B / DoD) e não vai a deploy sem ele.

### Design
- Design system real em `theme.css` + `theme_manager.js`: tokens via CSS variables, com
  temas claro e escuro (`--bg-page`, `--text-primary`, `--border-subtle`, etc.).
  **NÃO é Tailwind.** A UI não pode ter aparência genérica de IA; segue os tokens existentes.
- Regra permanente: tabelas executivas limpas, padding confortável, fonte monoespaçada
  para alinhamento de decimais financeiros, gráficos reativos com **rótulos de valor
  fixos/visíveis** (tooltip é complemento, nunca a única forma de ver o número).

### Regras de domínio específicas (o testador e a segurança DEVEM verificar)
- **Operações líquidas estritas** em abatimentos; preservação algébrica de valores
  negativos como redução da rubrica (Estornos — Regra Brendon Costa Vital).
- **Competência**: receita ancorada na data de emissão; despesa na data de pagamento, com
  ajuste dinâmico de PJs internos (nota recua 1 mês na competência; benefícios ficam no mês).
- **Faturamento**: identificar notas mães (status DESMEMBRADO) e parcelas filhas; chaves
  compostas normalizadas (Upsert) para evitar duplicidade no Firestore.
- Filtros avançados (centros de custo) restritos ao escopo de dados do usuário no backend
  (regras), não só no front.

### Volume / escala de referência
- App de controladoria interno; leitura intensiva de coleções financeiras. Padrão de
  performance: Map/Reduce client-side em memória para evitar requisições repetidas pesadas
  ao Firestore.

---

## PARTE B — Regras da Fábrica (universais — adaptadas à stack do CentraFin)

### Time de agentes (8)
1. coordenador — orquestra, filtra o diretor, mantém DIARIO.md. Não codifica, não faz push.
2. arquiteto — desenha e revisa; poder de veto técnico. Não codifica.
3. **designer** — redefinido para o CentraFin (decisão diretor 2026-07-01): **guardião de
   consistência visual, não gerador de protótipo**. Antes do frontend codar, produz uma
   **spec de diff visual** em `design/specs/<feature>.md` (o que muda, o que fica intocado,
   quais tokens de `theme.css` usar, se já existe padrão equivalente em outro módulo — para
   não reinventar componente). Depois que o frontend implementa, faz **auditoria de
   aderência ao design system** (tokens corretos, sem cor hardcoded, tema claro/escuro
   íntegro) — gate técnico ANTES da validação visual do diretor. NÃO gera HTML navegável do
   zero; NÃO substitui a validação visual do diretor, apenas poupa essa validação de bugs
   óbvios de CSS. Tools: Read, Grep, Glob (mais Write restrito a `design/specs/`).
4. engenheiro-backend — aqui = **engenheiro de `firestore.rules` + módulos JS/lógica**
   (`core_rules.js`, `importacao_folha.js`, integrações Firestore). Não faz push.
5. engenheiro-frontend — telas/módulos HTML/CSS/JS seguindo `theme.css` e a spec do
   designer. Não faz push.
6. seguranca — audita regras do Firestore, authz, exposição de dado, LGPD. Reporta, não corrige.
7. testador-auditor — valida (ver DoD adaptado); **cria a flag** `READY_<feature>`. Não faz push.
8. deployer — único que faz `firebase deploy` / push (trava por hook).
> Trade-off assumido: um gate a mais antes de codar (spec) e um depois (auditoria de
> tokens) — mais lento por feature, mas pega erro de UI cedo (barato) em vez de na
> validação final do diretor (caro). Se os dois gates de visual se mostrarem redundantes
> com a validação final, simplifica-se depois — é reversível.

### Lei do fluxo de trabalho (NÃO violar)
1. Ordem por tarefa: (arquiteto ->) [designer: spec de diff visual, se UI] -> engenheiro ->
   [designer: auditoria de tokens, se UI] -> [seguranca ->] testador-auditor ->
   [VALIDAÇÃO VISUAL DO DIRETOR, se houver UI] -> flag `READY_<feature>` -> deployer.
2. Nenhum push/deploy sem a flag do testador-auditor.
3. Deploy nunca ocorre com achado CRÍTICO/ALTO de segurança em aberto.
4. **Toda mudança em `firestore.rules` passa pelo emulador antes do deploy** — inegociável.
5. Tarefa concluída = implementada, testada no emulador, auditada, **validada
   visualmente pelo diretor (se UI)**, deployada e registrada no DIARIO.md.
6. Cada feature vive em seu branch `feature/<nome>`.

### Validação visual do diretor (features com UI) — cláusula formal
- Antes de criar a flag em qualquer feature com interface, o diretor abre a tela rodando
  (preview channel ou local) e valida. Verde do agente NÃO substitui validação visual.
- A auditoria de tokens do designer (ver Time de agentes) é um gate TÉCNICO anterior —
  pega erro óbvio de CSS/tema antes de chegar ao diretor; não substitui o julgamento dele.
- A aprovação visual do diretor, registrada textualmente (mensagem do diretor confirmando
  validação, capturada no DIARIO.md), é suficiente como evidência. Não é necessário anexar
  captura de tela (`screen.png`) ao repositório. Enquanto não há aprovação visual, a flag
  não é criada.

### Lei da decisão (proteção da arquitetura) — NÃO violar
A fábrica opera com autonomia, MAS PARA e CONSULTA o diretor (via coordenador) antes de:
- Trocar/alterar a arquitetura decidida na Parte A (Firebase Hosting/Firestore/Auth,
  HTML vanilla, projeto `centra-fin`, design system `theme.css`).
- **Alterar `firestore.rules`** de modo que amplie acesso, ou qualquer mudança de
  authn/authz/privacidade/LGPD.
- **Executar scripts que escrevem/apagam dados reais** (`clean_lancamentos.mjs`,
  `tmp_*.js`, `populate.mjs` e similares) — ação irreversível por definição.
- Mudar integração/projeto Firebase, ou introduzir dependência paga / serviço externo novo.
- Qualquer ação irreversível em produção ou em dados reais.

Regra do "conceito diferente": se o diretor pedir algo já mapeado com outro nome/conceito,
NÃO executar a troca — apontar que já existe, explicar diferença e riscos, pedir confirmação.

Ao escalar, trazer sempre, EM LOTE e em linguagem de negócio: (a) o que muda, (b) por que
é perigoso/irreversível, (c) os riscos, (d) a alternativa recomendada. Cada decisão do
diretor é registrada no DIARIO.md.

### Definition of Done (ADAPTADO à stack Firebase/HTML — substitui jest/lint/typecheck)
- Check de **sintaxe** dos arquivos JS/HTML alterados (parse limpo).
- **Teste de `firestore.rules` no emulador** cobrindo os casos da feature SEMPRE que
  regras forem tocadas (mínimo: admin escreve, `consulta` é bloqueado, `hasMenu` restringe
  coleção sensível). Sem isso, a flag não é criada.
- Validação visual do diretor (features com UI) — aprovação textual registrada no DIARIO.md.
- Sem segredo real no código (apiKey público do Firebase não conta; chave de serviço /
  `.env` real, sim — proibido rastrear).
- Regras de domínio da Parte A respeitadas (operações líquidas, competência, notas
  mãe/filha, rótulos fixos nos gráficos).
- Sem pendência CRÍTICA/ALTA de segurança.

### NÃO SE APLICA ao CentraFin (mundo Postgres do CentraAtend)
- Validador de timestamp de migration (MIG-CLOCK-1): **não se aplica** — Firestore não tem
  migrations.
- Banco-de-DEV-por-worktree e veto schema-por-worktree: **não se aplica** — não há Postgres;
  isolamento é por branch e pelo **emulador local**.
- Suíte jest / lint / typecheck do monorepo: **não se aplica** — substituída pelo DoD acima.

### Backup / push (estado real: repo PÚBLICO em `github.com/rikegv/centrafin-app`)
- Push **seletivo** de branches reais; sem `--force` (branch divergida = pula e reporta).
- **Check anti-segredo por branch** antes de qualquer push (aborta se achar `.env`/chave
  de serviço rastreada). `.gitignore` já cobre `.env` (confirmado).
- Push é executado **pelo deployer**, atrás da trava.
- Decisão pendente do diretor: manter repo público ou torná-lo privado (regras e scripts
  de dados ficam visíveis no público).

### Convenções
- Commits: Conventional Commits (feat:, fix:, chore:, docs:, refactor:).
- Branches: feature/<nome>, fix/<nome>.
- Código em inglês quando novo; o legado em PT-BR é preservado (iteração cirúrgica).

### Memória do projeto
- DIARIO.md: registro vivo de decisões e progresso (mantido pelo coordenador).
- TASKS.md: backlog. Toda tarefa passa pelo fluxo dos gates.

### Ambiente operacional (decisões diretor 2026-06-30)
- Fábrica roda no **desktop** do diretor (onde o CentraFin já vive e o Firebase CLI já
  está autenticado). Futuro: migrar para a VM **sem mudar o que está em produção hoje**.
- Trava de deploy reescrita em **Node** (sem WSL/jq), ligada ao deployer.
- Homologação = **Firebase Emulator Suite** local (Firestore + rules isolados, sem tocar
  `centra-fin`). Preview channel só quando precisar de link compartilhável pré-go-live.
- `.claude/settings.json` e `settings.local.json` existentes são **preservados** (allowlist
  acumulada), não sobrescritos.

