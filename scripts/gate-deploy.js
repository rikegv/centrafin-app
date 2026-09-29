#!/usr/bin/env node
/**
 * gate-deploy.js — trava de deploy do CentraFin
 *
 * Amarrado ao Claude Code por um hook PreToolUse (matcher Bash|PowerShell) em
 * .claude/settings.json. Recebe no stdin o JSON padrao do hook (contem
 * tool_input.command). Intercepta comandos de push/deploy e SO libera quando as
 * duas pre-condicoes estao satisfeitas:
 *
 *   1. Working tree LIMPO (git status --porcelain vazio). Deploy nao pode ficar
 *      a frente do git (incidente registrado na Parte B do CLAUDE.md).
 *   2. Existe uma flag .claude/state/READY_* CORRESPONDENTE a frente que esta
 *      sendo publicada. A correspondencia e por BRANCH: o nome da flag tem que
 *      casar com o slug do branch atual (feature/<slug> -> READY_*<slug>*), para
 *      que flags READY_* antigas acumuladas NAO liberem um deploy de outra
 *      frente. A flag e o registro deliberado de que o gate de qualidade (lint +
 *      teste de firestore.rules no emulador quando as rules mudam) e a validacao
 *      do diretor na tela aconteceram; ela nasce DEPOIS deles e e removida logo
 *      apos o push (fluxo descrito na secao 8 do CLAUDE.md).
 *
 * A responsabilidade da flag e do FLUXO de deploy (coordenador cria apos o gate
 * verde e a validacao do diretor); nenhum agente a cria por conta propria.
 *
 * Cobre: git push (inclusive "git -C <dir> push"), firebase deploy,
 * hosting:clone (promove canal para live sem usar a palavra "deploy"), chamada
 * REST ao firebasehosting.googleapis.com, gh workflow/release, kubectl apply,
 * docker push. Roda tanto para a ferramenta Bash quanto para a PowerShell (o
 * deploy pode sair por qualquer uma das duas).
 * Falha fechada: erro inesperado do proprio gate BLOQUEIA.
 *
 * EXCECAO DO PREVIEW (OS-CP-GATE-PREVIEW-01, decisao do diretor 2026-09-27):
 * "firebase hosting:channel:deploy <canal>" publica num PREVIEW CHANNEL, que NAO
 * toca producao e e justamente o ambiente onde o diretor valida. Exigir a flag
 * READY_* nele criava impasse circular: a flag so nasce DEPOIS da validacao, mas
 * e o preview que permite validar. Preview passa SEM flag, mantendo a exigencia
 * de working tree limpo (o que e servido tem que ter vindo de um commit, para a
 * investigacao pos-fato continuar possivel). Producao (firebase deploy) e push
 * seguem exigindo flag correspondente ao branch.
 * A excecao e fechada por tres travas:
 * (1) REGRA UNICA sobre o comando INTEIRO: retiradas todas as ocorrencias do
 *     verbo "hosting:channel:deploy", se o que sobra ainda casa DEPLOY_PATTERN,
 *     entao ha publicacao de verdade junto do preview e a excecao nao se aplica.
 *     Nao ha segmentacao: tentar avaliar por segmento foi o que abriu furo (ver
 *     o comentario longo na implementacao), porque verbo partido pelo separador
 *     some de todos os segmentos.
 * (2) Canal chamado "live" nao conta como preview (aspas sao removidas antes do
 *     teste; conservador, um canal "live-teste" tambem e barrado).
 * (3) A liberacao do preview EXIGE que a conferencia de working tree limpo tenha
 *     sido bem-sucedida. No caminho do preview essa e a unica trava que sobra, e
 *     uma trava que falha aberta sozinha nao e trava.
 * hosting:clone e hosting:disable tambem entraram na lista de verbos barrados do
 * gate: o primeiro promove um canal a producao e o segundo DERRUBA o hosting de
 * producao, os dois sem usar a palavra "deploy". Nenhum era interceptado antes
 * desta frente, e o primeiro seria o caminho natural para driblar a excecao.
 * git send-pack entrou pelo mesmo motivo do lado do git: empurra commits para o
 * remoto sem usar a palavra "push".
 *
 * As travas 1 a 4 nasceram de uma auditoria adversarial (agente seguranca) e de
 * uma suite de teste (agente tester) que juntas acharam 7 furos na primeira
 * versao da excecao, incluindo dois furos ANTIGOS do gate. Regressao coberta por
 * scripts/test-gate-deploy.cjs.
 *
 * Limite conhecido (residual documentado): o hook so ve a string do comando de
 * topo; um verbo escondido dentro de um arquivo (bash deploy.sh, node deploy.js)
 * nao e interceptado. Deploy do CentraFin e sempre firebase CLI + git direto.
 *
 * BLOQUEIO INCONDICIONAL DE COMANDO DESTRUTIVO (OS-GATE-DESTRUTIVO-01, decisao
 * do diretor 2026-09-29): alem do controle de publicacao descrito acima, o gate
 * barra SEMPRE, sem flag de bypass e sem excecao, os comandos que apagam ou
 * sobrescrevem dado/codigo em massa: firestore:delete (o pior de todos, apagaria
 * colecoes de producao), firestore:databases:delete, database:remove,
 * hosting:disable, gcloud firestore import/export e databases delete,
 * git push --force (inclusive -f, --force-with-lease e refspec com "+"),
 * git reset --hard, git clean -f, git branch -D, e remocao recursiva E forcada
 * de arquivos (rm -rf e o Remove-Item -Recurse -Force do PowerShell).
 * A fabrica nao tem motivo legitimo para nenhum deles; se o diretor precisar, ele
 * desliga a trava na hora, deliberadamente. Este bloco e o PRIMEIRO do gate, antes
 * do early-exit de DEPLOY_PATTERN: comando destrutivo nao e comando de publicacao
 * e sairia sem ser olhado se a ordem fosse outra.
 * Limite deliberado da remocao de arquivo: o gatilho e a RECURSAO, nao o par
 * recursivo+forcado. `rm -r pasta` destroi a arvore sozinho (o "-f" so suprime o
 * prompt), entao exigir as duas flags juntas deixava essa forma passar. Exigir
 * recursao JA preserva o caso legitimo que o diretor pediu para nao travar:
 * `rm -f um-arquivo.txt` e `Remove-Item -Force a.txt` continuam passando.
 * Excecao: em `git rm` o par recursivo+forcado continua sendo exigido, senao
 * `git rm -r --cached <path>`, que so tira do indice e nao apaga arquivo, cairia.
 *
 * ── RESIDUAIS ACEITOS DO BLOQUEIO DESTRUTIVO ────────────────────────────────
 * Esta lista e a LINHA DE PARADA da frente, recomendada pelo agente seguranca
 * depois de CINCO rodadas de auditoria adversarial (8 rotas graves na primeira,
 * depois 8, 2, 2, e por fim 1 familia). A regua que ele propos, e que vale aqui,
 * NAO e "nenhuma rota existe": um hook que le a string do comando nunca sera a
 * prova de adversario humano. A regua e "nenhuma rota ACIDENTALMENTE alcancavel,
 * e nenhum trabalho legitimo barrado". Tudo abaixo passa nessa regua.
 *
 * 1. Verbo escondido DENTRO de arquivo (`bash limpar.sh`, `node x.js`, alias de
 *    git ja configurado) nao e visto: o hook le so a string do comando de topo.
 * 2. Verbo CITADO em texto BLOQUEIA (mensagem de commit, `grep` pelo verbo).
 *    Distinguir citado de executado exigiria dividir a linha como o shell divide,
 *    que e o meio-parse que gerou furo em todas as rodadas. Contorno em uso desde
 *    2026-09-27: mensagem por arquivo (`git commit -F <arquivo>`) e busca pela
 *    ferramenta Grep, nao pelo grep de shell.
 * 3. Verbos git FORA da lista que o diretor fechou, e que por isso NAO entraram:
 *    `push --mirror`, `push --delete`, `push origin :branch`, `checkout -f`,
 *    `filter-branch --force`, `update-ref -d`. Propostos ao diretor.
 * 4. `curl -X DELETE` ao firestore.googleapis.com (rota REST do Firestore).
 *    A rota REST do Hosting ja e coberta pelo DEPLOY_PATTERN; esta ficou fora da
 *    lista e foi proposta ao diretor.
 * 5. `git rm -r "dir --cached"`: o `--cached` citado nao se distingue da opcao.
 *    Sem rota executavel provada (o git aborta em pathspec que nao casa).
 * 6. `-Recurse: $false` com ESPACO depois dos dois-pontos libera o parametro no
 *    PowerShell mas o gate le `-Recurse` puro e barra. Falso positivo estreito.
 * 7. Agrupamentos que o parser real REJEITA e que o gate libera (`rm -orf`,
 *    `rm -cr`, `rm -dry`, `rm -for`, `/usr/bin/rd/s/q`, `&&#`). Nao sao divida:
 *    o comando nao executa em shell nenhum.
 *
 * NAO e residual, e ficou FECHADO, mas o registro importa porque a premissa era
 * errada: o descarte de leitura malformada (ver LEITURAS) foi implementado
 * primeiro com a crenca de que "se a leitura esta malformada, aquele shell
 * rejeitaria o comando e nada executaria". O seguranca PROVOU que isso e falso em
 * comando multilinha: `bash -c 'echo PRIMEIRA\necho $(x\)'` imprime PRIMEIRA
 * ANTES de falhar, porque o bash executa comando a comando. Uma cauda malformada
 * na linha 2 descartava a leitura que enxergava o verbo na linha 1, e isso abriu
 * 7 rotas (`r\m -rf build/` e `firebase firestore\:delete` com cauda
 * `echo $(x\)`). Fechadas limitando o descarte a comando de UMA LINHA.
 *
 * Tambem NAO e residual, e tambem ficou fechado: a familia do `<#`, que voltou
 * TRES vezes por portas diferentes (citado, no corpo de heredoc, e heredoc com
 * introdutor nao reconhecido ou terminador indentado). A causa nao era nenhuma das
 * tres portas: era a producao `<# #>` disparar nas DUAS leituras, quando ela e
 * EXCLUSIVA do PowerShell e no bash `<#` nao significa nada. Condicionada a
 * leitura do PowerShell, a leitura do bash nunca engole nada por `<#`, ve o verbo
 * e bloqueia, sem depender de o tokenizador acertar cada forma de heredoc. A licao,
 * que e a mesma da OS-CP-GATE-PREVIEW-01: quando a mesma familia volta, o remendo
 * esta na porta errada, e o que fecha e RESTRINGIR o mecanismo, nao amplia-lo.
 *
 * ── REGRA DE PROCESSO, NAO OPCIONAL ─────────────────────────────────────────
 * QUALQUER edicao neste arquivo roda `node scripts/test-gate-deploy.cjs` ANTES do
 * commit. O risco principal deste gate deixou de ser o falso negativo e passou a
 * ser a OSCILACAO: em todas as rodadas, apertar de um lado abriu do outro
 * (`-uf` x `-Format`; `/s` em caminho x `rd /s/q`; `o` x `-of`; a pilha de
 * citacao x o acento grave do PowerShell). Foi a suite que pegou cada uma dessas
 * inversoes, e ela imprime a impressao digital do gate justamente para acusar
 * quando ele muda no meio de uma rodada.
 *
 * Saida: exit 0 = libera. exit 2 = bloqueia (Claude Code interpreta como veto e
 * devolve o stderr ao modelo).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    return '';
  }
}

// Normaliza um texto para slug comparavel: minusculo, nao-alfanumerico vira '-',
// bordas aparadas. "READY_OS-GATE-DEPLOY-01" -> "os-gate-deploy-01".
function normalizeSlug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Deriva o slug da frente a partir do branch. Remove o prefixo de tipo
// (feature/, fix/, hotfix/, chore/...) ficando so com a parte descritiva.
function branchSlug(branch) {
  const tail = String(branch).split('/').pop() || '';
  return normalizeSlug(tail);
}

function main() {
  const raw = readStdin();
  let command = '';
  try {
    const parsed = JSON.parse(raw);
    command = (parsed.tool_input && parsed.tool_input.command) || '';
  } catch (e) {
    // Se nao vier JSON valido, usa o texto cru. Comandos de deploy reais sempre
    // chegam via hook estruturado; isso e caso de borda.
    command = raw || '';
  }

  // Remove continuacoes de linha para o padrao nao ser furado por
  // "firebase \<nl> deploy". Cobre os DOIS estilos, porque o hook roda tanto
  // para Bash (barra invertida) quanto para PowerShell (acento grave): sem o
  // segundo caso, "firebase `<nl> deploy" nao era interceptado por ninguem
  // (furo antigo, achado pelo tester em 2026-09-27).
  command = command.replace(/[\\`]\r?\n/g, ' ');

  // ── 0. COMANDOS DESTRUTIVOS: BLOQUEIO INCONDICIONAL ──────────────────────
  // OS-GATE-DESTRUTIVO-01, decisao do diretor (2026-09-29): a fabrica NAO tem
  // motivo legitimo para rodar comando que apaga/sobrescreve dado ou codigo em
  // massa. Estes verbos sao barrados SEMPRE: sem flag de bypass, sem excecao de
  // preview, sem depender de arvore limpa. Se o diretor precisar de um deles, ele
  // desliga a trava na hora, deliberadamente.
  //
  // POR QUE ESTE BLOCO E O PRIMEIRO DE TODOS: a checagem tem que vir ANTES do
  // early-exit `if (!DEPLOY_PATTERN.test(command)) exit(0)`. `rm -rf` e
  // `git reset --hard` nao sao comandos de publicacao e nao casam DEPLOY_PATTERN;
  // avaliados depois daquele return, sairiam pela porta da frente sem nunca serem
  // olhados. Ordem e a regra aqui, nao detalhe de estilo.
  //
  // DETECCAO SOBRE O COMANDO INTEIRO, sem segmentar: e a licao que a
  // OS-CP-GATE-PREVIEW-01 pagou caro (verbo partido por um separador sumia de
  // todos os segmentos). O unico uso de separador aqui e DELIMITAR A JANELA DE
  // FLAGS de um `rm`/`Remove-Item` ja encontrado, para nao ler a flag de um
  // comando encadeado DEPOIS como se fosse deste, o que barraria trabalho
  // legitimo (o diretor pediu explicitamente que o legitimo continue passando).

  // ── TOKENIZACAO UNICA ────────────────────────────────────────────────────
  // Esta funcao e a correcao ESTRUTURAL de TRES geracoes de furo que tinham
  // todas a MESMA assinatura, diagnosticada pelo seguranca na terceira rodada:
  // uma TRANSFORMACAO do texto rodando ANTES de o gate saber o que e citacao.
  // Foi truncar no "#", depois remover aspas por replace, depois remover o bloco
  // "<# #>" e decidir aspa por paridade global. Cada correcao MOVIA a
  // transformacao em vez de elimina-la, e a classe voltava por outra porta na
  // rodada seguinte. E a mesma licao da OS-CP-GATE-PREVIEW-01: o que fechou o
  // furo foi TIRAR mecanismo, nao acrescentar defesa.
  //
  // Agora ha UMA passada que decide, caractere por caractere, o que e codigo, o
  // que e citado, o que e comentario e o que e substituicao de comando. Ela
  // devolve o texto de CODIGO ja normalizado (sem os caracteres de aspa, entao
  // `fire"store:delete"` vira `firestore:delete` de graca, sem variante) e o mapa
  // de quais posicoes sao separador DE VERDADE. Todos os detectores consultam
  // isso, e nenhum volta a mexer no texto cru.
  function tokenizar(bruto, opcoes) {
    const semAspa = (opcoes && opcoes.semAspa) || '';
    const semBloco = !!(opcoes && opcoes.semBloco);
    const escapaBarra = !!(opcoes && opcoes.escapaBarra);
    const saida = [];
    const separador = [];
    const empurrar = (c, sep) => { saida.push(c); separador.push(!!sep); };
    let aspa = null;
    let profSub = 0;
    let grave = false;
    let profBloco = 0;
    let emComentarioDeLinha = false;
    const pilhaCitacao = [];
    const heredocsPendentes = [];
    for (let i = 0; i < bruto.length; i++) {
      const c = bruto[i];
      const prox = bruto[i + 1];
      if (emComentarioDeLinha) {
        if (c === '\n') { emComentarioDeLinha = false; empurrar(c, true); }
        continue;
      }
      if (profBloco > 0) {
        // Bloco do PowerShell ANINHA, por isso profundidade e nao uma passada de
        // regex nao-gulosa (que deixava um "#>" orfao e o corte de linha truncava
        // o resto do comando).
        if (c === '<' && prox === '#') { profBloco++; i++; continue; }
        if (c === '#' && prox === '>') { profBloco--; i++; continue; }
        continue;
      }
      // Escape por barra invertida e coisa do BASH; o PowerShell usa acento
      // grave e trata "\" como caractere comum de caminho. O gate nao sabe qual
      // shell executa, entao a interpretacao vem por OPCAO e as duas sao lidas.
      // O caractere de ESCAPE depende do shell: bash usa "\", PowerShell usa
      // acento grave. Nenhum dos dois escapa nada dentro de ASPAS SIMPLES, e por
      // isso a condicao. Tratar o acento grave como escape na leitura do
      // PowerShell e o que devolve `rm -f "log`nx.txt"` ao trabalho normal: `n
      // e nova linha e e uso idiomatico de todo dia no shell primario daqui.
      const escapeDoShell = escapaBarra ? '\\' : '`';
      if (c === escapeDoShell && prox !== undefined && aspa !== "'") { empurrar(prox, false); i++; continue; }
      // SUBSTITUICAO DE COMANDO ABRE CONTEXTO NOVO DE CITACAO, INCLUSIVE DENTRO
      // DE ASPAS, e por isso estas duas checagens vem ANTES do ramo de aspa.
      // E o que o shell faz: em `"$(echo "a|b")"` as aspas de dentro sao um
      // argumento aninhado, nao o fecha das de fora. Avaliadas depois do ramo de
      // aspa, a aspa interna FECHAVA a externa e dali em diante o gate lia como
      // codigo o que o shell le como citado: separador voltava a cortar janela e
      // "#" voltava a abrir comentario, descartando o resto da linha (furo G4-1,
      // que liberava `git commit -m "$(printf "fix #1")" && git push --force`).
      // A pilha guarda a aspa de fora e a devolve no fecha.
      // A CONDICAO `aspa !== "'"` e o que faltava, e a falta dela reabriu a mesma
      // familia por tres rodadas: em ASPAS SIMPLES nenhum dos dois shells
      // substitui coisa alguma, o conteudo e literal. Sem a condicao, um `$(` ou
      // um acento grave IMPAR dentro de aspas simples zerava o estado de citacao,
      // e dali em diante um "#" de dentro da string abria comentario e descartava
      // o resto da linha, inclusive o verbo destrutivo depois do ";" (furo G5-1,
      // que liberava `echo 'nota $(x #1' ; firebase firestore:delete`).
      if (aspa !== "'" && c === '$' && prox === '(') {
        pilhaCitacao.push(aspa); aspa = null; profSub++;
        empurrar('$', false); empurrar('(', false); i++; continue;
      }
      if (aspa !== "'" && c === ')' && profSub > 0) {
        profSub--; aspa = pilhaCitacao.length ? pilhaCitacao.pop() : null;
        empurrar(c, false); continue;
      }
      // Acento grave e substituicao de comando SO no bash. No PowerShell ele e
      // escape, e ja foi tratado acima como `escapeDoShell`.
      if (escapaBarra && aspa !== "'" && c === '`') {
        if (grave) { grave = false; aspa = pilhaCitacao.length ? pilhaCitacao.pop() : null; }
        else { pilhaCitacao.push(aspa); aspa = null; grave = true; }
        empurrar(c, false); continue;
      }
      if (aspa !== null) {
        if (c === aspa) { aspa = null; continue; }
        empurrar(c, false);   // dentro de aspas nada e separador de comando
        continue;
      }
      // Here-string do PowerShell: @" ... "@ e @' ... '@ sao regiao CITADA. Sem
      // esta producao, as aspas de abre e fecha dela eram lidas como aspas
      // comuns e um numero impar de aspas no corpo invertia o emparelhamento,
      // fazendo um "#" de dentro da string abrir comentario (furo G4-3).
      // HEREDOC do bash: o CORPO e DADO, nao codigo. Sem esta producao, um `<#`
      // escrito dentro do corpo abria comentario de bloco e engolia o comando que
      // vinha DEPOIS do terminador, onde o shell executa de verdade (achado do
      // tester: `cat <<'EOF'` com `<#` no corpo liberava `rm -rf build/`,
      // `git push --force` e `firestore:delete`). E a mesma familia do G3-1, onde
      // o `<#` citado nao podia abrir bloco, por outra porta.
      // O introdutor so e reconhecido fora de aspas; o corpo comeca na linha
      // seguinte e termina na linha que e EXATAMENTE o delimitador, que e a regra
      // do bash.
      if (c === '<' && prox === '<') {
        const intro = /^<<-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(bruto.slice(i));
        if (intro) { heredocsPendentes.push(intro[2]); i += intro[0].length - 1; continue; }
      }
      if (c === '\n' && heredocsPendentes.length > 0) {
        empurrar('\n', true);
        const delimitador = heredocsPendentes.shift();
        let j = i + 1;
        while (j < bruto.length) {
          let fimDaLinha = bruto.indexOf('\n', j);
          if (fimDaLinha === -1) fimDaLinha = bruto.length;
          if (bruto.slice(j, fimDaLinha).trim() === delimitador) { j = fimDaLinha; break; }
          for (let k = j; k < fimDaLinha; k++) empurrar(bruto[k], false);
          if (fimDaLinha >= bruto.length) { j = bruto.length; break; }
          empurrar('\n', false);
          j = fimDaLinha + 1;
        }
        i = j - 1;
        continue;
      }
      if ((c === '@' && (prox === '"' || prox === "'")) && !semAspa.includes(prox)) {
        const fim = bruto.indexOf(prox + '@', i + 2);
        const limite = fim === -1 ? bruto.length : fim;
        for (let k = i + 2; k < limite; k++) empurrar(bruto[k], false);
        i = (fim === -1 ? bruto.length : fim + 1);
        continue;
      }
      if ((c === '"' || c === "'") && !semAspa.includes(c)) { aspa = c; continue; }
      // "<#" so abre bloco FORA de citacao: entre aspas ele e texto comum, e
      // remover o trecho entre um "<#" e um "#>" citados apagava pedaco de
      // comando que o shell EXECUTA (furo G3-1).
      // ... e SO na leitura do PowerShell. Comentario de bloco `<# #>` e producao
      // EXCLUSIVA do PowerShell; no bash `<#` nao significa nada. Fazer a producao
      // disparar nas duas leituras foi a causa RAIZ de uma familia que voltou TRES
      // vezes: `<#` citado (G3-1), `<#` no corpo de heredoc (achado do tester), e
      // heredoc cujo introdutor a regex nao reconhece ou cujo terminador vem
      // indentado (G6-1 e G6-2). Com a condicao, a leitura do bash NUNCA engole
      // nada por causa de `<#`, entao ela ve o verbo e bloqueia, sem depender de o
      // tokenizador acertar cada forma de heredoc. Ataca a causa, nao o sintoma.
      if (!semBloco && !escapaBarra && c === '<' && prox === '#') { profBloco++; i++; continue; }
      // O "#" de um "#>" nunca abre comentario de linha: e fecha de bloco.
      if (c === '#' && prox !== '>' && (saida.length === 0 || /\s/.test(saida[saida.length - 1]))) {
        emComentarioDeLinha = true;
        continue;
      }
      empurrar(c, profSub === 0 && !grave && (c === ';' || c === '|' || c === '&' || c === '\n'));
    }
    return {
      texto: saida.join(''), separador, aspaAberta: aspa, blocoAberto: profBloco > 0,
      // Substituicao de comando aberta e sem fechar: o shell REJEITA o comando e
      // nada executa. Serve para descartar a leitura do shell errado, ver LEITURAS.
      malformado: profSub > 0 || grave,
    };
  }

  // Uma aspa que nunca FECHA e comando malformado, nao citacao: ela e relida como
  // caractere comum, senao um apostrofo de escrita normal ("it's") engoliria o
  // resto da linha e barraria trabalho legitimo. Mesmo tratamento para bloco
  // "<#" que nao fecha. A decisao vem da VARREDURA, e nunca de contar paridade
  // antes de olhar: a paridade global era o furo G3-2, onde uma aspa de um tipo
  // dentro de uma regiao citada do outro tipo desligava o primeiro tipo e reabria
  // o corte de comentario no meio do comando.
  function lerComando(bruto, escapaBarra) {
    let r = tokenizar(bruto, { escapaBarra });
    let semAspa = '';
    let semBloco = false;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      if (r.aspaAberta !== null && !semAspa.includes(r.aspaAberta)) semAspa += r.aspaAberta;
      else if (r.blocoAberto && !semBloco) semBloco = true;
      else break;
      r = tokenizar(bruto, { escapaBarra, semAspa, semBloco });
    }
    return r;
  }

  // Janela de flags de UM comando: do ponto dado ate o proximo separador DE
  // VERDADE, pelo mapa que a tokenizacao ja produziu.
  function janelaDeFlags(leitura, desde) {
    for (let i = desde; i < leitura.texto.length; i++) {
      if (leitura.separador[i]) return leitura.texto.slice(desde, i);
    }
    return leitura.texto.slice(desde);
  }

  // Roda `fn(janela)` para CADA ocorrencia do verbo, nao so a primeira.
  //
  // Esta funcao existe por um furo provado pelo seguranca (VETO de 2026-09-29):
  // ancorar a janela na PRIMEIRA ocorrencia deixava passar
  // `git clean --dry-run && git clean -fd`, que e justamente o fluxo que a
  // constituicao manda usar (conferir antes, aplicar depois). Qualquer mencao
  // anterior do verbo deslocava a janela para um lugar inofensivo. O mesmo valia
  // para `git push origin main ; git push -f origin main`.
  function algumaJanela(leitura, verboRe, fn) {
    const re = new RegExp(verboRe.source, verboRe.flags.replace('g', '') + 'g');
    let m;
    while ((m = re.exec(leitura.texto)) !== null) {
      if (fn(janelaDeFlags(leitura, m.index + m[0].length), m)) return true;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return false;
  }

  // O token aceita DIGITO depois do traco: `-4` e `-6` sao opcoes reais de
  // `git push` e o parse-options do git agrupa opcoes curtas, entao `-4f` vale
  // `--ipv4 --force`. Exigir letra deixava essa forma fora da leitura inteira.
  // O token carrega tambem o sufixo `:valor`, porque no PowerShell um parametro
  // de chave pode ser DESLIGADO explicitamente (`-Recurse:$false`), e ler so o
  // nome fazia o gate entender o contrario do que o comando faz.
  function tokensDeFlag(janela) {
    return (janela.match(/(?:^|\s)(--?[A-Za-z0-9][\w-]*(?::\$?\w+)?)/g) || []).map((t) => t.trim());
  }

  // Parametros de PowerShell que NAO sao recursivo nem forcado, mas cujas letras
  // enganariam a leitura por agrupamento Unix. "-Confirm" e "-Filter" tem "r" e
  // "f" no corpo, entao sem esta lista `Remove-Item -Confirm:$false a.txt`, que
  // apaga UM arquivo, era lido como remocao recursiva e forcada e travava
  // trabalho de rotina (falso positivo provado pelo seguranca; `-Confirm:$false`
  // e o idioma padrao do PowerShell, que e o shell primario deste ambiente).
  const PARAMS_INOFENSIVOS = [
    'confirm', 'filter', 'literalpath', 'path', 'include', 'exclude', 'whatif',
    'verbose', 'erroraction', 'errorvariable', 'warningaction', 'informationaction',
    'outvariable', 'outbuffer', 'debug', 'stream', 'credential', 'encoding',
    'dry-run', 'dryrun', 'quiet', 'name', 'message', 'cached', 'interactive',
  ];

  // Classifica UM token de flag como recursivo e/ou forcado.
  //
  // A ordem importa e e o ponto delicado desta frente: PowerShell aceita
  // ABREVIACAO de parametro ("-Recurse" pode vir "-rec"), enquanto Unix AGRUPA
  // flags de uma letra ("-rf"). Nome de parametro e resolvido ANTES de
  // agrupamento, e agrupamento so se aplica a corpo CURTO e so de letras: sem
  // isso, todo parametro comprido com "r" e "f" no meio virava destrutivo.
  function classificarFlag(tokenBruto) {
    // Parametro de chave DESLIGADO explicitamente nao liga nada: no PowerShell
    // `-Recurse:$false` significa NAO recursivo, e ler so o nome fazia o gate
    // entender o oposto do comando e barrar remocao de um arquivo so (falso
    // positivo provado pelo tester).
    const [nomeDaFlag, valorDaFlag] = tokenBruto.split(':');
    if (valorDaFlag !== undefined && /^\$?(?:false|0)$/i.test(valorDaFlag)) {
      return { recursivo: false, forcado: false };
    }
    const token = nomeDaFlag;
    const corpo = token.replace(/^-+/, '');
    const baixo = corpo.toLowerCase();
    if (!corpo) return { recursivo: false, forcado: false };
    // Recursivo: "-r", "-rec", "-Recurse", "--recursive".
    if (/^recurs/.test(baixo) || 'recursive'.startsWith(baixo) || 'recurse'.startsWith(baixo)) {
      return { recursivo: true, forcado: false };
    }
    // Forcado: "-f", "-for", "-Force", "--force-with-lease", "--force-if-includes".
    if (/^force/.test(baixo) || 'force'.startsWith(baixo)) {
      return { recursivo: false, forcado: true };
    }
    // Parametro inofensivo casa por NOME COMPLETO, ou por abreviacao de 4+ letras.
    // Aceitar qualquer PREFIXO era furo: 'dry-run'.startsWith('dr') e verdadeiro,
    // entao `rm -dr build/` (que no GNU rm e "-d" mais "-r", remocao recursiva de
    // verdade) era classificado como inofensivo e passava.
    const inofensivo = PARAMS_INOFENSIVOS.some((p) => p === baixo || (baixo.length >= 4 && p.startsWith(baixo)));
    if (inofensivo) return { recursivo: false, forcado: false };
    if (/^--/.test(token)) return { recursivo: false, forcado: false };
    // Sobrou agrupamento estilo Unix. O criterio NAO e comprimento: media-lo era
    // gerador de falso negativo, porque bastava encher o corpo de "-v" repetido
    // (aceito por rm, git push e git clean) para o token estourar o teto e ser
    // ignorado, como em `rm -rfvvd`, `git clean -ffdxq` e `git push -fvvvv`.
    // O criterio certo e a NATUREZA do corpo: agrupamento e um punhado de flags
    // de UMA letra, entao TODO caractere do corpo precisa ser uma flag curta que
    // ESTES comandos aceitam de verdade (rm, git push, git clean; `git branch`
    // tem regra propria e nao passa por aqui). O conjunto ja errou nos dois
    // sentidos, e os dois erros custaram uma rodada de auditoria cada:
    //  - ESTREITO demais deixou `git push -uf` escapar, force push de verdade,
    //    porque faltava o "u" (regressao pega pelo tester);
    //  - LARGO demais barrou nome de parametro real que tem "r" e "f" no meio,
    //    como `-Format`, `-Prefix` e `-NoProfile`, este ultimo flag comum de
    //    PowerShell (falsos positivos provados pelo seguranca). Crescer
    //    PARAMS_INOFENSIVOS nao resolveria: a lista de parametros e infinita, o
    //    conjunto de flags CURTAS e finito e pequeno.
    // Os digitos entram pelo `-4f`/`-6f` do git push, e o "o" pelo `-o <option>`
    // (push option) do mesmo comando: faltando o "o", `git push -ufo ci.skip`
    // saia da leitura inteira e o force push passava. Conferido que acrescentar
    // "o" NAO reabre os falsos positivos de nome de parametro, porque cada um
    // deles tem outra letra de fora: "Format" tem m/a/t, "Prefix" tem p,
    // "NoProfile" tem p/l.
    if (!/^[dDfFiInNoOqQrRuUvVxXeE0-9]+$/.test(corpo)) return { recursivo: false, forcado: false };
    // O `-o` do git push CONSOME o resto do token como VALOR dele, entao o que
    // vem depois de um "o" no agrupamento nao e flag: `git push -of` e `-o` com
    // valor "f", e nao force push (achado do tester). Ja `-ufo ci.skip` continua
    // sendo force, porque o "f" vem ANTES do "o".
    const agrupadas = corpo.split(/[oO]/)[0];
    return { recursivo: /[rR]/.test(agrupadas), forcado: /[fF]/.test(agrupadas) };
  }

  // `verboDeCmd` liga a leitura de switch estilo "/s". Ela vale SO quando o verbo
  // da janela e um removedor do cmd.exe: aplicada a toda janela, um argumento
  // POSIX que seja exatamente `/s` ou `/f` virava switch e barrava trabalho
  // legitimo (`rm -f /s`, `git clean -n -e /f`, falsos positivos do seguranca).
  function flagsDaJanela(janela, verboDeCmd) {
    let recursivo = false;
    let forcado = false;
    for (const t of tokensDeFlag(janela)) {
      const c = classificarFlag(t);
      if (c.recursivo) recursivo = true;
      if (c.forcado) forcado = true;
    }
    if (!verboDeCmd) return { recursivo, forcado };
    // Estilo cmd.exe: "rd /s /q", "del /f /s /q" e a forma COLADA "rd /s/q".
    // O switch precisa COMECAR em fronteira de espaco (ou no inicio da janela) e
    // TERMINAR em espaco: sem essa ancora, um CAMINHO que contenha o segmento
    // "/s" era lido como switch recursivo e barrava trabalho normal
    // (`Remove-Item C:/s/a.txt -Force`, falso positivo provado pelo tester).
    // A ancora nao custa deteccao: `/s`, `/s /q` e `/s/q` continuam casando.
    const switchesCmd = (janela.match(/(?:^|\s)(\/[sSqQfF](?:\/[sSqQfF])*)(?=\s|$)/g) || [])
      .join('').toLowerCase();
    if (switchesCmd.includes('s')) recursivo = true;
    if (switchesCmd.includes('q') || switchesCmd.includes('f')) forcado = true;
    return { recursivo, forcado };
  }

  const janelaTemForce = (janela) => flagsDaJanela(janela).forcado;

  // Roda `fn` sobre a janela de CADA invocacao do git. A janela comeca no verbo
  // "git" e morre no separador, entao subcomando e flags lidos ali sao mesmo
  // deste git, e nao de um comando encadeado ao lado. Cobre "git -C <dir>",
  // "git --work-tree=...", caminho absoluto, ".exe" e maiuscula.
  const janelaDeGit = (leitura, fn) => algumaJanela(leitura, /\bgit(?:\.exe)?\b/i, fn);

  // Detector de remocao recursiva de arquivos, no Bash e no PowerShell.
  //
  // REGRA: recursivo ja basta para barrar. `rm -r build/` destroi a arvore
  // inteira sozinho (o "-f" so suprime o prompt), e exigir as duas flags juntas
  // deixava essa forma passar. Exigir recursivo JA preserva o caso legitimo que
  // o diretor pediu para nao travar: `rm -f um-arquivo.txt` e
  // `Remove-Item -Force a.txt` continuam passando, porque nao sao recursivos.
  // EXCECAO `git rm`: ali o par recursivo+forcado continua sendo exigido, senao
  // `git rm -r --cached <path>`, que so tira do indice e nao apaga nada, cairia.
  function removeRecursivo(leitura) {
    const cmd = leitura.texto;
    // Separadores incluem aspas, barra invertida, "=" e BARRA: sem isso
    // `sh -c "rm -rf x"`, `'rm' -rf x`, o caminho qualificado
    // `Microsoft.PowerShell.Management\Remove-Item` e, principalmente, o binario
    // chamado por caminho (`/bin/rm -rf`, `./scripts/rm -rf`, `$HOME/bin/rm -rf`,
    // `C:/Program Files/Git/usr/bin/rm.exe -rf`) escapavam inteiros.
    // O fim do verbo aceita espaco OU barra, porque o cmd.exe cola o switch no
    // proprio verbo (`rd/s/q pasta`), forma que exigindo espaco escapava inteira.
    const RE_RM = /(?:^|[\s;&|(){}`"'\\/=])(rm|rmdir|ri|rd|del|erase|Remove-Item)(?:\.exe)?(?=[\s/])/gi;
    // Cano para um removedor: o "-Recurse" pode estar no comando de ORIGEM, como
    // em `Get-ChildItem x -Recurse | Remove-Item -Force`. Nesse caso a recursao
    // vale para o conjunto inteiro que chega no cano.
    const canoParaRemover = /\|\s*(?:rm|ri|del|Remove-Item)\b/i.test(cmd) &&
                            flagsDaJanela(cmd, false).recursivo;
    // Verbos que existem SO no cmd.exe. Para eles, o caractere anterior nao pode
    // ser barra nem aspa: senao um SEGMENTO DE CAMINHO com esse nome virava
    // invocacao (`rm -f cache/rd/s` era lido como o `rd` do cmd com switch /s,
    // falso positivo do seguranca). Para `rm` e `Remove-Item` a classe larga
    // continua, porque `/bin/rm -rf` e `...Management\Remove-Item` sao reais.
    const CMD_PURO = /^(?:rd|rmdir|del|erase)$/i;
    let m;
    while ((m = RE_RM.exec(cmd)) !== null) {
      const anterior = m.index === 0 ? '' : cmd[m.index];
      const depois = cmd[m.index + m[0].length];
      const ehCmdPuro = CMD_PURO.test(m[1]);
      // Verbo de cmd DENTRO de um caminho e segmento de caminho, nao invocacao,
      // mas so quando o que vem depois dele continua o caminho. Seguido de
      // ESPACO, e chamada de verdade por caminho absoluto e tem que barrar
      // (`C:\Windows\System32\del.exe -Recurse -Force x`, achado do tester);
      // seguido de BARRA, e caminho (`rm -f cache/rd/s`, falso positivo do
      // seguranca) e nao pode barrar.
      if (ehCmdPuro && /[\\/"']/.test(anterior) && depois === '/') continue;
      const janela = janelaDeFlags(leitura, m.index + m[0].length);
      const f = flagsDaJanela(janela, ehCmdPuro);
      // `git rm` tem regra propria, e ela e ancorada no `--cached`, nao no par
      // recursivo+forcado. O caso legitimo que motivou a excecao e exatamente
      // `git rm -r --cached <path>`, que so tira do indice e nao encosta no
      // disco. Sem o `--cached`, `git rm -r src/` APAGA os arquivos
      // recursivamente (o `-f` do git rm so dispensa a conferencia contra o
      // indice), entao a excecao ancorada em "sem forcado" era larga demais.
      const ehGitRm = /\bgit\s+$/i.test(cmd.slice(0, m.index + m[0].length - m[1].length));
      if (ehGitRm) {
        // O `--cached` vale so ANTES de um `--` solto: depois dele o git trata
        // tudo como pathspec, entao `git rm -r -- --cached src/` NAO e uma
        // remocao do indice e a excecao nao se aplica (frouxidao posicional
        // apontada pelo seguranca; direcao fail-closed).
        const antesDoFim = janela.split(/\s--(?=\s|$)/)[0];
        if (f.recursivo && !/--(?:cached|staged)\b/i.test(antesDoFim)) return 'git ' + m[1];
        continue;
      }
      if (f.recursivo || canoParaRemover) return m[1];
    }
    return null;
  }

  // Cada entrada: rotulo legivel + teste sobre UMA leitura tokenizada. `L` e a
  // leitura; `L.texto` e o codigo ja normalizado (sem aspa, sem comentario).
  const DESTRUTIVOS = [
    // Firebase CLI: apagam dado de PRODUCAO, irreversivel e silencioso.
    // Verbo sozinho, sem exigir a palavra "firebase" na frente, para cobrir npx,
    // caminho absoluto do binario e apelido de shell.
    { nome: 'firebase firestore:delete (apaga colecao de producao)',
      teste: (L) => /\bfirestore:delete\b/i.test(L.texto) },
    { nome: 'firebase firestore:databases:delete (apaga o banco inteiro)',
      teste: (L) => /\bfirestore:databases:delete\b/i.test(L.texto) },
    { nome: 'firebase database:remove (apaga no Realtime Database)',
      teste: (L) => /\bdatabase:remove\b/i.test(L.texto) },
    { nome: 'firebase hosting:disable (derruba o hosting de producao)',
      teste: (L) => /\bhosting:disable\b/i.test(L.texto) },

    // gcloud: import sobrescreve dado; databases delete apaga o banco.
    { nome: 'gcloud firestore import/export (sobrescreve dado de producao)',
      teste: (L) => /\bgcloud\b[^\n]*\bfirestore\b[^\n]*\b(?:import|export)\b/i.test(L.texto) },
    { nome: 'gcloud firestore databases delete (apaga o banco)',
      teste: (L) => /\bgcloud\b[^\n]*\bfirestore\b[^\n]*\bdatabases\b[^\n]*\bdelete\b/i.test(L.texto) },

    // git: reescrevem historico remoto ou destroem trabalho local.
    // O par git+verbo aceita qualquer coisa no meio para cobrir "git -C <dir>",
    // "git --work-tree=...", caminho absoluto do binario e npx.
    // send-pack entra junto de push: empurra commits sem usar a palavra "push",
    // e o cabecalho deste gate ja o tratava como equivalente no controle de
    // publicacao; ficar de fora daqui era incoerencia dentro do mesmo arquivo.
    // O refspec com "+" (ex.: "git push origin +main") forca sem usar a palavra
    // "force": e a rota de escape obvia se a deteccao olhasse so as flags.
    // O subcomando tem que pertencer A ESTA invocacao do git, e e por isso que a
    // janela e ancorada no proprio "git" e nao no subcomando: exigir apenas "ha
    // um git em algum lugar da linha" produzia falso positivo provado pelo
    // tester, `git status && npm run clean --force`, onde o "clean" e do npm e
    // nada de git e destrutivo. A janela morre no separador, entao o subcomando
    // de um comando encadeado depois nao e atribuido ao git.
    { nome: 'git push --force (reescreve o historico do remoto)',
      teste: (L) => janelaDeGit(L, (j) => /\b(?:push|send-pack)\b/i.test(j) &&
                      (janelaTemForce(j) || /\s\+[\w./*-]+(?::[\w./*-]+)?(?=\s|$)/.test(j))) },
    { nome: 'git reset --hard (descarta alteracoes sem recuperacao)',
      teste: (L) => janelaDeGit(L, (j) => /\breset\b/i.test(j) && /--hard\b/i.test(j)) },
    { nome: 'git clean -f (apaga arquivos nao rastreados)',
      teste: (L) => janelaDeGit(L, (j) => /\bclean\b/i.test(j) && janelaTemForce(j)) },
    // "-D" e CASE-SENSITIVE de proposito: "-d" so apaga branch ja mergeado e e
    // operacao segura, que continua passando. A sensibilidade vale SO para o
    // "-D": as palavras "git" e "branch" sao case-insensitive, senao
    // `Git branch -D x` escapava (o Windows resolve "Git" e "GIT" igual).
    { nome: 'git branch -D (apaga branch sem conferir merge)',
      teste: (L) => janelaDeGit(L, (j) => /\bbranch\b/i.test(j) &&
                      (/(?:^|\s)-[A-Za-z]*D[A-Za-z]*(?=\s|$)/.test(j) ||
                       (/--delete\b/i.test(j) && /--force\b/i.test(j)))) },

    // Remocao recursiva de arquivos (Bash, PowerShell e cmd.exe).
    { nome: 'remocao recursiva de arquivos (rm -rf e equivalentes)',
      teste: (L) => removeRecursivo(L) !== null },
    // Chamada .NET direta, que nao usa verbo de shell nenhum.
    { nome: 'System.IO.Directory::Delete (remocao recursiva por .NET)',
      teste: (L) => /System\.IO\.(?:Directory|File)\s*\]?\s*::\s*Delete/i.test(L.texto) },
  ];

  // AS DUAS LEITURAS: o bash trata "\" como escape (entao `firestore\:delete`
  // executa como `firestore:delete`), o PowerShell nao (ali "\" e separador de
  // caminho, e e o que faz `Microsoft.PowerShell.Management\Remove-Item`
  // funcionar). O gate nao sabe qual dos dois shells vai executar, entao le o
  // comando das duas formas e bloqueia se QUALQUER uma delas for destrutiva, que
  // e a direcao segura pedida pelo diretor.
  //
  // Nao ha mais "variante por replace": a colagem de `fire"store:delete"` sai da
  // propria tokenizacao. Trocar os replace encadeados por uma leitura unica foi a
  // correcao estrutural desta frente, porque cada replace antes da varredura era
  // uma geracao nova de furo (ver a nota grande em `tokenizar`).
  // Quando UMA das duas leituras termina com substituicao de comando ABERTA, ela
  // e a leitura do shell ERRADO, e usar so as bem formadas evita barrar trabalho
  // legitimo do shell certo (era o caso de `rm -f "log`nx.txt" ;
  // Get-ChildItem -Recurse .`, PowerShell idiomatico que a leitura do bash lia
  // como substituicao sem fecho e por isso fundia os comandos numa janela so).
  //
  // O DESCARTE SO VALE EM COMANDO DE UMA LINHA, e esta condicao e o ponto mais
  // importante deste trecho. A primeira versao descartava sempre, apoiada numa
  // premissa que o seguranca PROVOU FALSA: "o shell rejeitaria o comando, entao
  // nada executou". O bash executa comando a comando, e uma cauda malformada na
  // linha 2 nao impede a linha 1 de rodar:
  //     bash -c 'echo PRIMEIRA\necho $(x\)'   imprime PRIMEIRA, e depois falha.
  // Com isso, uma cauda como `echo $(x\)` deixava malformada exatamente UMA das
  // leituras (o `\)` escapa o fecha so na leitura do bash) e descartava justo a
  // leitura que enxergava o verbo escrito com barra no meio (`r\m -rf build/`,
  // `firebase firestore\:delete`). Sete rotas, todas fechadas por esta condicao.
  //
  // A condicao separa exatamente os dois casos, e por isso nao troca um pelo
  // outro: o falso positivo que motivou o descarte e de UMA linha, e a rota de
  // escape e MULTILINHA. Em comando multilinha as duas leituras continuam
  // valendo, que e a direcao fail-closed. Se as duas ficarem malformadas, as duas
  // tambem continuam valendo, pelo mesmo motivo.
  const leiturasBrutas = [lerComando(command, true), lerComando(command, false)];
  const umaLinhaSo = !/\n/.test(command);
  const bemFormadas = leiturasBrutas.filter((r) => !r.malformado);
  const LEITURAS = (umaLinhaSo && bemFormadas.length > 0) ? bemFormadas : leiturasBrutas;

  for (const d of DESTRUTIVOS) {
    let bateu = false;
    for (const leitura of LEITURAS) {
      try {
        if (d.teste(leitura)) { bateu = true; break; }
      } catch (e) {
        // Detector que explode NAO libera: fail-closed tambem aqui dentro.
        bateu = true;
        break;
      }
    }
    if (bateu) {
      process.stderr.write(
        'BLOQUEADO: comando DESTRUTIVO interceptado.\n' +
        'Detectado: ' + d.nome + '\n' +
        'Comando: ' + command.trim().slice(0, 300) + '\n\n' +
        'A fabrica NAO executa comandos destrutivos. Nao ha flag de bypass: esta trava ' +
        'nao depende de READY_*, de arvore limpa nem da excecao de preview.\n' +
        'Se esta operacao for mesmo necessaria, ela e do DIRETOR, que desliga a trava ' +
        'deliberadamente na hora (OS-GATE-DESTRUTIVO-01).\n\n' +
        'O GATE NAO ESTA QUEBRADO se voce so CITOU o verbo em texto. Ele le a string ' +
        'do comando e nao distingue verbo citado de verbo executado. Contorno:\n' +
        '  - mensagem de commit que cite estes verbos vai por ARQUIVO: git commit -F <arquivo>\n' +
        '  - busca por texto usa a ferramenta Grep, nao o grep de shell\n' +
        '  - string de teste mora DENTRO de um arquivo .cjs, nunca na linha de comando\n'
      );
      process.exit(2);
    }
  }

  // Verbos de publicacao interceptados. Os pares verbo/objeto aceitam qualquer
  // coisa no meio (mesma linha), para nao serem furados por flags intermediarias
  // como "git -C <dir> push" ou "git --work-tree=... push". O par firebase+deploy
  // ja cobre "firebase deploy" e "firebase hosting:channel:deploy".
  const DEPLOY_PATTERN = /(\bgit\b[^\n]*\b(?:push|send-pack)\b|\bfirebase\b[^\n]*\bdeploy\b|\bfirebase\b[^\n]*\b(?:hosting:clone|hosting:disable)\b|firebasehosting\.googleapis\.com|\bgh\b[^\n]*\b(?:workflow|release)\b|\bkubectl\b[^\n]*\bapply\b|\bdocker\b[^\n]*\bpush\b)/i;
  const RULES_PATTERN = /firestore:rules/i;

  if (!DEPLOY_PATTERN.test(command)) {
    process.exit(0); // nao e comando de deploy/push — libera
  }

  // ── Excecao do preview channel (ver cabecalho) ───────────────────────────
  // REGRA UNICA, aplicada ao comando INTEIRO: retire do comando TODAS as
  // ocorrencias do verbo de preview "hosting:channel:deploy"; se o que sobrar
  // ainda casar DEPLOY_PATTERN, entao o comando carrega uma publicacao de
  // verdade alem do preview, e a excecao NAO se aplica.
  //
  // Historia desta linha, porque ela ja foi complicada e voltou a ser simples:
  // a primeira versao avaliava o comando por SEGMENTO (&&, ;, |, e depois &,
  // $( ), acento grave) e exigia que todo segmento de deploy fosse preview. A
  // premissa era "quebrar em mais pedacos so pode apertar". A premissa e FALSA,
  // e o tester provou: a segmentacao nao decide so a excecao, ela tambem decide
  // ONDE a deteccao olha. Um verbo PARTIDO pelo separador
  // ("firebase $(echo deploy)") sumia de todos os segmentos, nenhum casava o
  // padrao, e o segmento de preview levava o comando inteiro para a excecao.
  // Duas dessas strings eram bloqueadas ANTES de eu acrescentar separadores:
  // a tentativa de fechar buraco abriu outro.
  // Sem segmentacao esta classe inteira deixa de existir, porque a deteccao
  // volta a olhar o comando inteiro, exatamente como o gate sempre fez.
  const semOVerboDePreview = command.replace(/hosting:channel:deploy/gi, ' ');
  const temPreview = /\bfirebase\b/i.test(command) && /\bhosting:channel:deploy\b/i.test(command);
  // Canal "live" nao e preview: seria publicar em producao. As aspas sao
  // removidas antes do teste porque "live" entre aspas driblava o casamento, e o
  // token e procurado em qualquer posicao depois do verbo (o nome do canal pode
  // vir depois de flags como --expires 7d). Conservador de proposito: um canal
  // "live-teste" tambem cai aqui. Falso positivo custa trocar o nome do canal;
  // falso negativo custaria publicar em producao pela porta do preview.
  const depoisDoVerbo = command
    .replace(/["']/g, '')
    .split(/hosting:channel:deploy/i)
    .slice(1)
    .join(' ');
  const soPreview =
    temPreview &&
    !/\blive\b/i.test(depoisDoVerbo) &&
    !DEPLOY_PATTERN.test(semOVerboDePreview);

  // ── 1. Working tree limpo ────────────────────────────────────────────────
  // `arvoreConferida` registra se este criterio pode ser confiado. Para o gate
  // cheio ele continua falhando ABERTO (a flag ainda protege), mas a liberacao do
  // preview passou a EXIGIR a conferencia bem-sucedida: no caminho do preview a
  // arvore limpa e a unica trava que sobra, e uma trava fail-open sozinha nao e
  // trava (veto do seguranca, 2026-09-27: com cwd fora de repositorio git o
  // preview era liberado direto).
  let arvoreConferida = false;
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8', timeout: 5000 }).trim();
    arvoreConferida = true;
    if (status.length > 0) {
      process.stderr.write(
        'BLOQUEADO: working tree sujo, ha alteracoes nao commitadas.\n' +
        'Commite as alteracoes antes de fazer deploy/push.\n' +
        'Arquivos pendentes:\n' + status + '\n'
      );
      process.exit(2);
    }
  } catch (e) {
    // git indisponivel ou timeout: nao bloqueia por este criterio (falha aberta).
  }

  // ── 1b. Preview channel: libera SEM flag (ver EXCECAO DO PREVIEW) ────────
  // Chega aqui so com working tree limpo (checagem 1 acima), entao o que vai
  // para o canal de preview corresponde a um commit.
  if (soPreview && arvoreConferida) {
    process.stderr.write(
      'NOTA: preview channel (firebase hosting:channel:deploy). Nao toca producao, ' +
      'liberado sem flag READY_*. Producao e push continuam exigindo a flag da frente.\n'
    );
    process.exit(0);
  }
  if (soPreview && !arvoreConferida) {
    process.stderr.write(
      'AVISO: preview channel, mas nao foi possivel conferir se o working tree esta ' +
      'limpo (git indisponivel, timeout ou fora de repositorio). A excecao do preview ' +
      'NAO se aplica sem essa conferencia; caindo na exigencia de flag READY_*.\n'
    );
  }

  // ── 2. Flag READY_* correspondente ao branch ─────────────────────────────
  const stateDir = path.join(process.cwd(), '.claude', 'state');
  let readyFlags = [];
  try {
    readyFlags = fs.readdirSync(stateDir).filter((f) => f.startsWith('READY_'));
  } catch (e) {
    readyFlags = [];
  }

  if (readyFlags.length === 0) {
    process.stderr.write(
      'BLOQUEADO: nenhuma flag .claude/state/READY_* encontrada. Deploy negado.\n' +
      'Crie a flag da frente apos o gate verde e a validacao do diretor.\n'
    );
    process.exit(2);
  }

  // Descobre o branch atual para exigir a flag correspondente.
  let branch = '';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', timeout: 5000 }).trim();
  } catch (e) {
    branch = '';
  }

  const slug = branchSlug(branch);
  const isMainish = /^(main|master)$/i.test(branch);

  const flagSlugs = readyFlags.map((f) => normalizeSlug(f.replace(/^READY_/, '')));

  if (isMainish) {
    // main/master: nao ha slug de frente para casar. Mantem modo permissivo
    // (exige apenas que exista alguma flag, ja garantido acima) com AVISO.
    // Apertar o deploy a partir de main e pendencia registrada para OS separada
    // (ver DIARIO.md / secao 8 do CLAUDE.md).
    process.stderr.write(
      'AVISO: deploy a partir de "' + branch + '"; correspondencia estrita de flag ' +
      'nao se aplica em main/master, liberando com base na existencia de flag READY_*.\n'
    );
  } else if (branch && slug.length >= 3) {
    // Branch de frente: exige uma flag tao especifica quanto o branch, nome
    // igual ou que CONTENHA o slug do branch (cobre READY_os-<slug>-01). NAO
    // aceita o contrario (flag curta tipo "gate" liberando branch "gate-deploy"),
    // para a correspondencia nao afrouxar entre sub-frentes de nome parecido.
    const matched = flagSlugs.some((fs2) => fs2 === slug || fs2.includes(slug));
    if (!matched) {
      process.stderr.write(
        'BLOQUEADO: nenhuma flag READY_* corresponde ao branch "' + branch + '".\n' +
        'Esperado uma flag cujo nome contenha "' + slug + '" ' +
        '(ex.: .claude/state/READY_' + slug + ').\n' +
        'Flags READY_* acumuladas de outras frentes NAO liberam este deploy.\n'
      );
      process.exit(2);
    }
  } else {
    // Branch indetectavel (rev-parse falhou), HEAD destacado ou slug curto demais:
    // nao da para verificar a correspondencia. BLOQUEIA (fail-closed) em vez de
    // cair no modo permissivo, para nao reabrir a fraqueza das flags acumuladas.
    process.stderr.write(
      'BLOQUEADO: nao foi possivel determinar o branch (' + (branch || 'desconhecido') + ') ' +
      'para casar a flag READY_* da frente. Deploy negado (fail-closed).\n'
    );
    process.exit(2);
  }

  // Reforco informativo para deploy de firestore.rules (nao bloqueia por si so:
  // a flag da frente ja representa o gate verde, que inclui o teste de rules no
  // emulador quando as rules mudam, secao 8 do CLAUDE.md).
  if (RULES_PATTERN.test(command)) {
    process.stderr.write(
      'NOTA: deploy inclui firestore:rules. Confirme que o teste de rules no ' +
      'emulador rodou antes desta publicacao (pre-condicao da flag).\n'
    );
  }

  process.exit(0); // libera
}

// Fail-closed: qualquer erro inesperado no gate BLOQUEIA (exit 2), nunca deixa
// o deploy passar por um crash. process.exit() nao lanca, entao o fluxo normal
// nao cai aqui; so excecoes de verdade caem.
try {
  main();
} catch (e) {
  process.stderr.write(
    'BLOQUEADO: erro inesperado no gate de deploy, negando por seguranca (fail-closed): ' +
    ((e && e.message) || String(e)) + '\n'
  );
  process.exit(2);
}
