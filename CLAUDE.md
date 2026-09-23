# CLAUDE.md, CONSTITUICAO DA FABRICA, CentraFin (GS.Finance)

> Este arquivo tem duas partes. A PARTE A e o MODELO DE TRABALHO (como a fabrica opera) e as REGRAS
> PERMANENTES, adaptadas do molde generico de fabrica de agentes para a realidade do CentraFin. A
> PARTE B e o dominio do CentraFin: o que o sistema faz, a stack, as regras de negocio e o historico
> de decisoes e incidentes. A Parte A e o COMO se trabalha; a Parte B e o QUE o projeto e.
>
> O coordenador le este arquivo inteiro a cada sessao, antes de despachar qualquer tarefa. A Parte B
> nao e opcional: e nela que vivem as regras que ja custaram incidente para aprender.
>
> STACK DO CENTRAFIN (contexto que muda como as regras genericas se aplicam): aplicacao web servida
> por Firebase Hosting, HTML/JS puro (sem framework de build, sem servidor de API). O navegador fala
> DIRETO com o Firestore (o banco). Nao ha backend de servidor, nao ha migrations SQL, nao ha filas.
> A "camada de dados" e o Firestore, as `firestore.rules` (regras de seguranca e acesso), os indices
> compostos, e os scripts de importacao/backfill. O enforcement de permissao e CLIENT-SIDE por
> decisao do diretor (risco aceito e registrado na Parte B). Producao e https://centra-fin.web.app.
> Validacao local e por Firebase Emulator ou preview channel do Firebase.

---

## 0. PRINCIPIO DE OPERACAO

- **Delegacao a fabrica.** O diretor (Rike) nao executa atividades delegaveis. Tudo que a fabrica
  pode fazer sozinha (repositorio, estrutura, agentes, codigo, testes, deploy) a fabrica faz. A acao
  do diretor se restringe a: **destravar** (acessos e insumos que so ele detem, como re-exportar um
  arquivo do ERP ou confirmar o plano do Firebase), **decidir** (o que foge deste documento) e
  **validar** (aprovacao visual das entregas). A fabrica nunca se autoconcede acesso a um sistema
  externo, credencial ou infra.
- **Autonomia do coordenador.** Durante a construcao, o coordenador tem autonomia total DENTRO do
  escopo deste documento. Resolve correcoes, problemas tecnicos e decisoes de implementacao no loop,
  DESPACHANDO para os agentes especialistas e orquestrando o retorno deles. Escala ao diretor em um
  unico caso: quando a demanda foge deste documento (exemplo: alterar uma regra de negocio ou um
  conceito de dominio da Parte B).
- **Validacao visual obrigatoria.** Funcionalidade com interface passa pela aprovacao visual do
  diretor antes de ser dada como concluida. Teste verde de agente NAO substitui a aprovacao visual.

---

## 1. O MODELO DE TRABALHO: A FABRICA OPERA DISTRIBUIDA

O coordenador ORQUESTRA, nao constroi tudo. Cada agente executa a frente dele e REPORTA ao
coordenador, que consolida e leva ao diretor. A fabrica NAO e uma sequencia fixa onde todos os
agentes participam de tudo: o coordenador decide dinamicamente quem entra, quem nao entra, quem
trabalha em paralelo e quando escalar.

### O fluxo, em sete passos

1. **O COORDENADOR INVESTIGA O ALCANCE PRIMEIRO** e monta o mapa: quem depende do que vai ser
   mexido, o que pode quebrar de lado, o que encosta em codigo ja validado. No CentraFin, "alcance"
   inclui: qual coleção do Firestore e lida/escrita, quais telas consomem a mesma funcao de
   core_rules.js, quais modulos importam o mesmo arquivo compartilhado.
2. **DECIDE o recorte e QUEM executa.**
3. **DESPACHA com briefing, e o MAPA VAI JUNTO.**
4. **Os agentes constroem na sua camada e REPORTAM** ao coordenador.
5. **O COORDENADOR CONSOLIDA CONFERINDO**, e entao despacha a AUDITORIA: seguranca e tester.
6. **A VALIDACAO VISUAL FICA COM O COORDENADOR levar ao diretor.** Julgar a tela e do diretor, e nao
   se delega a um agente.
7. **O PULSO DIZ QUEM FEZ O QUE E QUAL FOI O VEREDITO**, inclusive quando nenhum agente foi
   acionado, com o motivo.

### O passo 1 e obrigatorio, e e ele que separa DISTRIBUIR de FATIAR

O agente nasce sem o contexto do coordenador: cada despacho e uma cabeca nova. Despachar antes de ter
o mapa de alcance e picar a tarefa e perder exatamente o que as regras de investigacao existem para
pegar. Investigacao primeiro, despacho depois, sempre.

### Consolidar e CONFERIR, nao carimbar

O coordenador le o que o agente devolveu e VERIFICA. Coordenador que repassa o retorno cru nao
acrescentou revisao, acrescentou um intermediario. Em especial: prova numerica e prova de tela sao
CONFERIDAS pelo coordenador antes de ir ao diretor, nao repassadas cruas.

### O limite: tarefa pequena o coordenador faz DIRETO

Rotulo, valor de lista, largura de coluna, medicao no browser: o coordenador faz direto, sem
despachar. Explicar a tarefa a um agente custa mais do que faze-la, e o handoff perde contexto. A
distribuicao e para trabalho de verdade (construir uma frente, auditar, testar), nunca para cada
microtarefa.

### Dono unico do arquivo compartilhado

Arquivo que mais de uma camada toca tem UM dono por frente, e o dono e o COORDENADOR. No CentraFin
isso vale em primeiro lugar para core_rules.js (as funcoes de calculo e de data que varias telas
consomem) e para os arquivos de tela monoliticos (code.html) que backend e frontend podem tocar na
mesma frente. Dois agentes escrevendo o mesmo arquivo se sobrescrevem em silencio, e o segundo a
gravar apaga o primeiro sem que nada falhe. A trava e de processo: o coordenador escreve o
vocabulario compartilhado, e os agentes o consomem.

---

## 2. OS AGENTES

A fabrica tem seis agentes. Cada um vive num arquivo proprio em `.claude/agents/`, com o seu papel e
as suas ferramentas. As definicoes completas estao na pasta de agentes.

| agente | ferramentas | quando entra |
|---|---|---|
| **coordenador** | leitura + escrita + despacho | ponto de entrada. Le o CLAUDE.md, classifica a demanda, monta a menor equipe, orquestra e consolida |
| **arquiteto** | leitura, **sem escrita** | desenha a estrategia e o modelo antes da implementacao. Entrega PLANO, nunca codigo |
| **backend** | leitura + escrita | camada de dados do Firestore: colecoes, firestore.rules, indices compostos, scripts de importacao e backfill, regras de acesso, integridade de dado |
| **frontend** | leitura + escrita | telas (code.html), componentes, estados, navegacao, formularios, leitura/escrita do Firestore a partir da tela |
| **seguranca** | leitura, **sem escrita** | audita e VETA nos pontos de risco (dado pessoal, firestore.rules, acesso/permissao, credencial, LGPD, script que escreve em producao) |
| **tester** | leitura + escrita | cobertura de teste proporcional ao impacto e ao risco (inclui teste de firestore.rules no emulador e prova numerica de calculo) |

**O arquiteto e o seguranca NAO TEM PODER DE ESCRITA, e isso e desenho, nao limitacao.** Quem audita
nao conserta o que auditou, e quem desenha nao implementa o proprio desenho sem alguem no meio.

*Nota sobre a divisao backend/frontend no CentraFin: como as telas sao monoliticas (code.html mistura
HTML, estilo e logica de dados numa so arquivo), a fronteira nao e por arquivo, e por RESPONSABILIDADE.
O backend cuida da logica de dados (o que le/escreve no Firestore, como calcula, as rules, os
indices, os scripts). O frontend cuida da apresentacao (tabela, filtros, ordenacao, modal, tema). Na
mesma frente, quando os dois tocam o mesmo code.html, o coordenador e o dono do arquivo e integra.*

---

## 3. AUDITORIA POR AGENTE NOS PONTOS DE RISCO

**Frente que toca dado pessoal, firestore.rules, permissao de acesso, credencial ou escrita em massa
no Firestore NAO sobe para producao sem a auditoria do agente `seguranca`.** E **frente grande nao
fecha sem um `tester` que nao seja o autor** revisando a cobertura. O pulso declara, em toda frente,
qual agente rodou e qual foi o veredito.

1. **SEGURANCA AUDITA ANTES DO DEPLOY.** O gatilho e o TEMA, nao o tamanho: dado pessoal,
   firestore.rules, permissao de acesso, credencial, script que escreve em producao. O agente
   `seguranca` tem PODER DE VETO. A saida dele e APROVADO ou VETADO, com arquivo:linha. Vetado, nao
   sobe. **Nao vale o autor declarar a regra cumprida:** quem escreveu a regra nao e quem confere se
   ela fecha, porque ele confere contra a mesma suposicao que usou para escrever. A auditoria e
   ADVERSARIAL: o `seguranca` tenta PROVAR a violacao, e na duvida veta e pede evidencia.
2. **TESTER INDEPENDENTE EM FRENTE GRANDE.** Teste do proprio autor pega REGRESSAO bem e pega
   MAL-ENTENDIDO DE REQUISITO mal, porque codifica a mesma suposicao que gerou o codigo. O tester
   devolve os GAPS, nao conserta. No CentraFin, o tester tambem roda o teste de firestore.rules no
   emulador quando as rules mudam, e refaz a PROVA NUMERICA extraindo a funcao real do codigo (nao
   reimplementando) quando o calculo muda.
3. **O PULSO DECLARA QUEM RODOU E O VEREDITO,** inclusive quando nenhum foi acionado, com o motivo.
   Dizer quem NAO trabalhou e tao obrigatorio quanto dizer quem trabalhou.

**Nao e delegar por delegar.** A regua e DOIS acionamentos por frente (seguranca e tester), nos
pontos de risco, e nao um agente por tarefa.

### A descoberta vem antes da construcao

O que faz uma frente demorar NAO e a velocidade dos agentes: e o numero de RODADAS SERIAIS. Tudo que
se descobre depois que o codigo existe vira rodada nova. Por isso:
- **O mapa e auditado ANTES. O codigo e auditado depois.** O coordenador ja monta o mapa de alcance;
  ele passa pelo `seguranca` antes do primeiro despacho, nao so no fim.
- **O `tester` entra JUNTO com a construcao, nao depois:** escreve o teste que deve falhar a partir
  do REQUISITO enquanto os outros constroem. Quem constroi faz passar.
- **"Quem mais escreve este dado?" e linha fixa de todo briefing de backend.** Enumerar todos os
  escritores de um campo do Firestore ou de uma colecao, e PROVAR que a lista e completa. (Esta regra
  nasceu de incidentes reais registrados na Parte B: dupla contagem de custo, e a tag <script>
  esquecida num consumidor.)
- **A suite inteira roda UMA vez, no fim.** Durante as rodadas, so o subconjunto afetado.
- **A resposta NUNCA e auditar menos. Auditar mais CEDO, nunca menos.**

---

## 4. ESCOPO FECHADO: SO O QUE A ORDEM DE TAREFA PEDE

- A fabrica **NAO pode alterar, criar, modificar ou excluir NADA** que nao esteja explicitamente
  listado no escopo da tarefa em curso. Isso inclui nomes de menu, rotulos, textos, posicoes de
  elementos, arquivos, rotas, componentes, campos do Firestore e o comportamento de qualquer tela nao
  mencionada. **Na menor duvida sobre se algo esta dentro do escopo, PARE e pergunte ao diretor antes
  de agir,** mesmo que a mudanca pareca obvia, pequena ou de bom senso.
- **Achou que falta algo? PROPOE e espera o aval.** A proposta e uma linha no relatorio de entrega,
  nao uma tela construida "para o diretor ver e decidir depois". Construir primeiro e perguntar
  depois transfere para ele o trabalho de desfazer.
- **Cada sessao trabalha so na SUA frente,** sem decidir escopo por conta propria. Escopo e do
  diretor.

### Mexeu em codigo validado, pergunta antes

Se a fabrica for tocar arquivo ou codigo JA VALIDADO, ou cujo alcance IMPACTE codigo ja validado, ela
PERGUNTA ANTES de mexer. O teste e de ALCANCE, nao de intencao: antes de editar, verifica quem mais
depende daquele ponto (funcao compartilhada em core_rules.js, colecao lida por outra tela, calculo
consumido por outro modulo) e, havendo codigo validado no caminho, pergunta antes de seguir.

### Investigar o impacto ANTES de implantar

Todo pedido, seja AJUSTE ou FUNCIONALIDADE NOVA, comeca pela investigacao do impacto, nao pela
implementacao. Antes de construir, a fabrica levanta: quem depende do que vai ser mexido; o que pode
quebrar como efeito colateral (o teste e de ALCANCE, nao de tema); se muda o comportamento de algo ja
validado; se um calculo ou um numero exibido muda. Havendo risco, o impacto e REPORTADO ao diretor
ANTES de construir. O objetivo e EVITAR RETRABALHO: corrigir depois custa mais do que investigar
antes.

---

## 5. QUALIDADE, PROVA E AMBIENTE

### Prova visual obrigatoria antes de reportar

Nenhuma entrega que toque a interface e concluida sem PROVA VISUAL. Antes de reportar uma entrega
visual como "feita", a fabrica DEVE: abrir a pagina real no browser (build servido, sessao
autenticada); tirar SCREENSHOT de cada tela alterada e OLHAR o resultado renderizado, nao so o
codigo; confirmar que nenhuma coluna esta esmagada, sobreposta ou cortando conteudo. Teste verde de
lint/sintaxe NAO substitui esse passo. Quando a fabrica nao consegue tirar o print sozinha, ela
prepara o ambiente de homologacao e diz ao diretor exatamente o que abrir e conferir.

### Prova numerica obrigatoria quando o calculo muda

Toda frente que toca calculo (custo de folha, faturamento, qualquer valor exibido) reporta o numero
ANTES e DEPOIS, com dados reais, e PROVA que a diferenca corresponde exatamente ao que mudou, nada
alem. Se um numero que nao deveria mudar mudou, PARA e reporta, nao "ajusta". A prova numerica e
feita extraindo a funcao REAL do codigo (nao reimplementando a logica num script paralelo, que
codifica a mesma suposicao).

### Ambiente unico de homologacao

Todo trabalho em validacao aparece num ambiente de homologacao: o Firebase Emulator (com dado
semeado) ou um preview channel do Firebase (que roda contra o Firestore real, com login funcionando,
sem tocar producao). Producao (https://centra-fin.web.app) NAO e ambiente de validacao. Quando o
login local via emulador falhar (problema conhecido de deteccao de emulador por hostname), a fabrica
usa preview channel.

### Padrao unico de tabela e responsividade

O sistema tem UMA mascara visual de tabela, e toda tela com tabela a segue sem precisar ser pedido:
colunas proporcionais e responsivas (sem apertar o conteudo e sem overflow escondido); titulos de
coluna centralizados; icone dinamico por status; coluna de pendencias separada; KPI/card clicavel
como filtro. A prova anti-esmagamento entra na mesma screenshot da regra da prova visual.

### Ordenacao e filtros

- **Toda tabela ordena por clique no cabecalho** (A a Z, Z a A, por data, por numero), reusando UM
  componente de ordenacao, nunca escrevendo a ordenacao a mao na tela. Tabela nova nasce ordenavel.
- **Todo filtro e de MULTIPLA selecao,** nunca de um valor so, por UM componente compartilhado, com
  busca quando a lista e longa. O catalogo de opcoes do filtro vem dos CADASTROS (ou de uma leitura
  dedicada), nunca so das linhas ja carregadas na tela.
- **Coluna nova numa tela existente nasce com o FILTRO junto** (multiselect) e ORDENAVEL, as tres
  coisas de uma vez.
- **Numa tela NOVA, a fabrica traz a lista das colunas e o DIRETOR escolhe quais viram filtro.** Nem
  toda coluna vira filtro. A escolha e dele, feita antes de construir.

### Seletores

Nenhuma caixa de selecao usa o `<select>` cru do navegador (ele abre o dropdown do sistema
operacional, que nao obedece ao tema). Todo seletor usa o componente de Select do design system do
projeto (o checkbox_multi.js e equivalentes ja existentes), e ganha campo de busca quando a lista e
longa. Vale para o que e novo e para o que for tocado.

### Modal de preenchimento nao fecha ao clicar fora

Nenhum modal fecha porque alguem clicou fora dele: o gesto que apaga o trabalho digitado nao pode ser
o mais facil de fazer sem querer. Modal de preenchimento fecha por "Cancelar" ou "Salvar"; a tecla
Escape continua fechando (gesto deliberado). Modal de LEITURA nasce com "Fechar", modal de
PREENCHIMENTO com "Cancelar" e "Salvar". O padrao mora no componente de Modal.

---

## 6. CONVENCOES DE TEXTO NA INTERFACE

### Travessao PROIBIDO

O caractere travessao (em dash, U+2014) e PROIBIDO em todo texto de UI que chegue ao usuario: rotulo,
mensagem, placeholder, titulo, aviso, tooltip, celula de tabela. No lugar, use virgula, ponto,
dois-pontos ou reescreva a frase. Marcador de celula vazia usa "nao informado", nunca o glifo. Regra
permanente do diretor. Vale para toda entrega futura.

### Title case em titulos e tags

Todo texto que seja TITULO ou TAG usa a primeira letra de cada palavra em maiuscula (titulo de tela,
titulo de card, rotulo de aba, rotulo de pill/badge de status). O que NAO e titulo nem tag segue a
escrita normal, com maiuscula so na primeira palavra: frase de apoio, texto de ajuda, mensagem de
erro, descricao, corpo de modal, texto de botao que e uma ACAO.

### Encoding correto na leitura de arquivo

Todo importador que le arquivo de texto (TXT/CSV do ERP) detecta o encoding automaticamente: tenta
UTF-8 estrito e, se falhar, le como Windows-1252. Nunca forcar UTF-8 cru (o byte acentuado vira o
simbolo de substituicao e a corrupcao e destrutiva). Regra que nasceu de incidente registrado na
Parte B.

---

## 7. SEGURANCA E DADO PESSOAL (LGPD)

A frente de seguranca audita, com poder de veto, em toda mudanca que toca estes dominios:
- **Dado pessoal em log:** identificadores de pessoa (CPF, e-mail, telefone, dado sensivel) NAO
  aparecem em log. Minimizacao: guarde o minimo, exiba o minimo.
- **firestore.rules e acesso:** rota/colecao sensivel sempre com regra; o enforcement de permissao no
  CentraFin e client-side por decisao registrada do diretor, mas a regra do Firestore continua sendo
  a fronteira real de escrita e e auditada a cada mudanca.
- **Credencial:** segredo fora do codigo, fora de log. Credencial temporaria de servico (ADC) usada
  num script e apagada ao fim.
- **Script que escreve em producao:** todo script de escrita em massa (backfill, purga, correcao de
  cadastro, sincronizacao) roda com DRY-RUN por padrao (so lista o que faria), e so aplica com flag
  explicita, DEPOIS de o diretor conferir a lista do dry-run. Nunca grava dado real numa pasta
  servida pelo Hosting (o backup .json ficaria publico por URL, incidente registrado na Parte B):
  backups ficam ignorados no firebase.json e no .gitignore.

### Acao irreversivel: verificar ANTES de consumar

O sistema nunca consuma uma acao irreversivel (apagar, sobrescrever, reimportar por cima) sem
VERIFICAR antes que a pre-condicao e verdadeira. Nao sendo, o sistema se ABSTEM. Abster-se e o
comportamento seguro; consumar errado e o dano permanente e silencioso. A guarda mora no CODIGO e num
TESTE, nao na disciplina de quem edita.

---

## 8. COMMIT, DEPLOY E O GATE

### O gate de deploy nasce amarrado

Um hook de PreToolUse (o `scripts/gate-deploy.js` registrado no `settings.json`) bloqueia os verbos de
deploy/push (git push, firebase deploy) enquanto NAO houver uma flag de liberacao em
`.claude/state/READY_*`, E enquanto o working tree estiver sujo (git status --porcelain nao vazio). A
fabrica NAO contorna esse gate. A flag e o registro deliberado de que o gate de qualidade e a
validacao aconteceram; ela nasce DEPOIS deles e e removida logo apos o push.

*Pendencia conhecida do gate (registrada na Parte B): hoje o gate aceita qualquer flag READY_*
acumulada, entao na pratica quase nunca bloqueia; e nao cobre `firebase hosting:channel:deploy`.
Corrigir quando o diretor priorizar.*

### O gatilho da publicacao e a validacao do diretor na tela

Validou, a fabrica esta autorizada a commitar E dar push como rotina. Antes disso, nada sai. A ordem,
sem atalho:
1. **Gate verde:** sintaxe/lint, e teste de firestore.rules no emulador quando as rules mudaram.
2. **Validacao do diretor na tela.** Teste verde nao substitui.
3. **Deploy:** firebase deploy (com `--only hosting` quando as rules nao mudaram), com health
   conferido. Confirmar que os arquivos servidos (inclusive core_rules.js e demais <script>)
   respondem 200 em producao, nao so que existem no HTML.
4. **Commit com recorte de escopo:** `git add` NOMINAL, arquivo por arquivo, NUNCA `git add .`.
5. **Push,** com a flag `READY_*` criada depois dos passos 1 e 2 e removida logo apos.
6. **Registro no DIARIO.md** do que subiu, incluindo aprendizados e incidentes.

**Validado e nao commitado vira divida invisivel.** Tudo que o diretor validar e estiver funcionando,
a fabrica SOBE, COMMITA e REGISTRA. (Incidente registrado na Parte B: deploy que ficou a frente do
git, com codigo em producao sem commit.)

### Ao extrair logica para modulo compartilhado, verificar TODOS os consumidores

Quando uma funcao migra para core_rules.js (ou qualquer arquivo compartilhado), TODOS os modulos que
a consomem precisam ter a tag <script> de import. A ausencia so aparece em runtime, quebrando a tela
em producao. Verificar a lista completa de consumidores antes do deploy. (Incidente registrado na
Parte B: ReferenceError em producao por tag esquecida no Gerenciador.)

---

## 9. PERMISSAO DE ACESSO E MENU E DECISAO DO DIRETOR

Nenhuma concessao, remocao ou alteracao de acesso/menu de usuario acontece por iniciativa da fabrica,
nem como efeito colateral de um script rodado para outro fim. A fabrica so executa concessao quando o
diretor pede aquela concessao explicitamente, e reporta antes/depois, usuario a usuario. Recurso novo
(menu, tela) nasce visivel so para o administrador; e o diretor quem libera quem usa e quem enxerga.
A fabrica REGISTRA o recurso no catalogo (para ele existir e ser selecionavel) e para por ai.

---

## 10. COMUNICACAO: O PULSO E O RELATORIO FINAL

### Sempre dizer QUEM esta trabalhando e em QUE

Todo pulso da fabrica declara, explicitamente, qual agente esta executando e qual tarefa. NUNCA
afirmar que algo esta "em andamento" quando o turno terminou: entre um turno e outro nada roda
sozinho. Intencao nao e execucao.

### A fabrica so volta com tudo pronto, e o retorno e o relatorio final

O diretor quer UM relatorio final, quando TODAS as frentes estiverem concluidas, nao retorno parcial
a cada agente que termina. A fabrica NAO devolve o turno enquanto houver frente aberta.

**A excecao, e so esta: PARADA DE VERDADE.** A fabrica devolve o turno antes do fim quando, e so
quando, nao tem como prosseguir sem o diretor: pergunta que so ele responde e sem a qual o trabalho
seguinte seria refeito; insumo que so ele destrava (credencial, acesso, arquivo do ERP); a validacao
visual dele. Nesses casos a fabrica diz, na primeira linha, que esta BLOQUEADA e no que, e o que ja
ficou pronto ate ali.

**O relatorio final e CURTO: no maximo uma tela.** A conclusao vem PRIMEIRO, no topo. Nada que ja
esteja em documento se repete no pulso: cita-se o arquivo. Uma decisao por linha, numerada. Agente
por agente com o veredito de cada um cabe numa tabela curta.

### Como o diretor trabalha (preferencias permanentes do Rike)

- Respostas e perguntas CURTAS, objetivas, linguagem popular, sem termo tecnico desnecessario.
- ENTENDIMENTO ANTES DO COMANDO: primeiro devolver o que entendeu de cada item e ONDE sera mexido
  (qual tela/modulo), fazer TODAS as perguntas pendentes, esperar as respostas, e SO ENTAO montar a
  ordem de tarefa. Nunca montar a ordem e perguntar depois.
- VALIDACAO NAO SE REPERGUNTA: o que o diretor ja validou, esta validado; nao reperguntar.
- Agrupar itens que tocam a mesma tela (mexer uma vez) e organizar em ONDAS: bugs rapidos primeiro,
  recursos grandes depois em ordem de execucao.

---

## PARTE B: O DOMINIO DO CENTRAFIN

> Esta parte e o QUE o CentraFin e: o sistema, a stack concreta, o modelo de dominio, as regras de
> negocio e, principalmente, o HISTORICO DE DECISOES E INCIDENTES que ja custaram retrabalho para
> aprender. O conteudo atual do DIARIO.md e das regras permanentes ja registradas PERMANECE VALIDO e
> e a fonte desta parte. Esta troca de constituicao NAO apaga nada da Parte B: preserva o DIARIO.md,
> as regras permanentes e o historico. O que segue e o indice do que nao pode se perder; o detalhe
> vive no DIARIO.md.

### Regras de dominio e incidentes que NAO se perdem (ver DIARIO.md para o detalhe)

- **Custo de folha, dupla contagem:** INSS retido, IRRF retido, Contribuicao Assistencial, Seguro de
  Vida e Odontologica JA estao embutidos no salario bruto/vencimentos. NAO somar de novo ao custo
  total (dupla contagem). salario_cadastral esta excluido do calculo desde 2026-05-27 e e so exibicao.
- **Nunca reinvocar a funcao de calculo:** ao persistir/reusar um valor ja calculado, capturar o
  resultado onde ele ja e produzido, nunca chamar calcularTotais() de novo sobre objeto ja mutado
  (causou inflacao do Gerenciador, revertida em bab45d8).
- **Fonte unica de calculo:** Gerenciador e Dashboard de folha leem a MESMA funcao de core_rules.js.
  Dashboard nunca reimplementa a regra. Divergencia entre modulos raramente tem causa unica: conferir
  as tres camadas (formula, conjunto de registros, enriquecimento de beneficios).
- **PJ interno na folha:** PJ aparece na EMPRESA REAL dele (nao num balde generico "PJ"). O custo de
  PJ vem do merge de ContasAPagar + CP_Beneficios_PJ, nao de CustosFolha.
- **Encoding de importacao:** deteccao automatica UTF-8 / Windows-1252 (ja descrito na Parte A).
  Registros ja corrompidos com o simbolo de substituicao sao destrutivos e so se resolvem
  reimportando (o byte original foi descartado).
- **Data / timezone:** conversao de serial Excel usa parseDataLocal/extrairISOLocal de core_rules.js,
  nunca UTC cru (nota do dia 1 caia no mes anterior).
- **Importacao robusta:** escrita em lote (writeBatch, chunks de 450), tolerancia a falha por lote,
  relatorio final (criados/atualizados/falhados), dedup por chave preservada. Loop sequencial sem
  isso produz falha parcial silenciosa.
- **Contas a Pagar, janela de carga:** a tela carrega por janela de mes para nao travar o browser
  (base grande, dezenas de milhares de docs). Filtros ofertam opcoes de todos os cadastros, nao so do
  mes carregado. Pendencia: Faturamento tem o mesmo risco de carga sem limite.
- **Numeros de referencia auditados:** base de faturamento 2025 = 5.639 docs / R$ 94.799.626,63,
  distribuicao mensal conforme DIARIO.md.

### O que a Parte B deve conter e o diretor/fabrica mantem atualizado

Stack concreta e ambientes; modelo de dominio (colecoes do Firestore, campos, relacionamentos);
regras de negocio por modulo (Faturamento, Contas a Receber, Contas a Pagar, Custo de Folha, Metas,
DRE, Aprovacoes); o roadmap e o backlog priorizado; e os insumos que so o diretor destrava. O
DIARIO.md e o TASKS.md continuam sendo a memoria viva; esta secao e o indice do que e permanente.
