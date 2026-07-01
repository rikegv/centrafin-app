/**
 * check-secrets.cjs — F0-06
 *
 * Check anti-segredo pré-push. Varre o conteúdo STAGED no git (git diff --cached)
 * em busca de padrões de segredo real (chave privada, client_secret, service_account,
 * senha hardcoded). NÃO acusa o apiKey público do Firebase (não é segredo — ver
 * CLAUDE.md, Parte A: a proteção do dado é a firestore.rules, não o apiKey).
 *
 * Uso: node scripts/check-secrets.cjs
 * Saída: exit 0 = limpo, libera push. exit 1 = achou padrão suspeito, aborta.
 */

const { execSync } = require('child_process');

const PATTERNS = [
  { name: 'private_key', regex: /private_key/i },
  { name: 'BEGIN PRIVATE KEY', regex: /BEGIN (RSA )?PRIVATE KEY/i },
  { name: 'client_secret', regex: /client_secret\s*[:=]\s*['"]/i },
  { name: 'service_account (JSON de credencial)', regex: /"type"\s*:\s*"service_account"/i },
  { name: 'senha hardcoded', regex: /password\s*[:=]\s*['"][^'"]{4,}['"]/i },
];

function getStagedDiff() {
  try {
    // Exclui a si mesmo do scan: este arquivo contem os PADROES de busca como
    // texto literal (ex.: a string "private_key" na definicao do regex), o que
    // geraria falso-positivo permanente contra o proprio checker.
    return execSync(
      "git diff --cached -- . \":(exclude)scripts/check-secrets.cjs\"",
      { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
    );
  } catch (e) {
    console.error('ERRO: nao foi possivel ler o diff staged (git diff --cached).');
    process.exit(1);
  }
}

function main() {
  const diff = getStagedDiff();
  if (!diff.trim()) {
    console.log('Nada staged. Nada para checar.');
    process.exit(0);
  }

  // Só olha linhas adicionadas (começam com "+", exceto "+++" de cabeçalho de arquivo)
  const addedLines = diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'));

  let found = [];
  for (const line of addedLines) {
    for (const p of PATTERNS) {
      if (p.regex.test(line)) {
        found.push({ pattern: p.name, line: line.slice(0, 200) });
      }
    }
  }

  if (found.length > 0) {
    console.log('BLOQUEADO: possivel segredo real encontrado no staged.\n');
    found.forEach((f) => {
      console.log(`  [${f.pattern}] ${f.line}`);
    });
    console.log('\nRemova do staged (git restore --staged <arquivo>) e trate como');
    console.log('credencial real (rotacionar se ja foi commitada em algum momento).');
    process.exit(1);
  }

  console.log('OK: nenhum padrao de segredo encontrado no staged. Push liberado.');
  process.exit(0);
}

main();
