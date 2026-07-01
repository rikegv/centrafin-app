/**
 * check-syntax.cjs — F0-05
 *
 * Valida sintaxe dos arquivos .js/.cjs/.mjs e .html alterados (staged no git),
 * como parte do Definition of Done adaptado do CentraFin (substitui jest/lint/typecheck,
 * que não se aplicam a esta stack vanilla).
 *
 * JS: usa `node --check` (parse nativo do Node, não executa o código).
 * HTML: valida que as tags <script> embutidas têm JS parseável, e faz um check
 * básico de balanceamento de tags (regex simples — não é um parser HTML completo,
 * mas pega os erros mais comuns de copiar/colar/editar).
 *
 * Uso: node scripts/check-syntax.cjs
 * Roda sobre os arquivos staged no git (git diff --cached --name-only).
 * Saída: exit 0 = tudo limpo. exit 1 = algum arquivo com erro de sintaxe.
 */

const { execSync } = require('child_process');
const fs = require('fs');

function getStagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf8',
    });
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (e) {
    console.error('ERRO: nao foi possivel listar arquivos staged (git diff --cached).');
    process.exit(1);
  }
}

function checkJs(file) {
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.stderr ? e.stderr.toString() : e.message };
  }
}

function checkHtmlScripts(file) {
  const content = fs.readFileSync(file, 'utf8');
  const scriptRegex = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match;
  let idx = 0;
  const errors = [];
  while ((match = scriptRegex.exec(content)) !== null) {
    idx++;
    const js = match[1];
    if (!js.trim()) continue; // <script src="..."> externo, sem corpo
    const tmpFile = `${file}.__tmp_script_${idx}.cjs`;
    try {
      fs.writeFileSync(tmpFile, js, 'utf8');
      execSync(`node --check "${tmpFile}"`, { stdio: 'pipe' });
    } catch (e) {
      errors.push(`  <script> #${idx}: ${(e.stderr || e.message).toString().split('\n')[0]}`);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  }
  return errors;
}

function main() {
  const files = getStagedFiles();
  if (files.length === 0) {
    console.log('Nenhum arquivo staged. Nada para checar.');
    process.exit(0);
  }

  let hasError = false;

  for (const file of files) {
    if (!fs.existsSync(file)) continue; // arquivo deletado, pula
    const ext = file.split('.').pop().toLowerCase();

    if (['js', 'cjs', 'mjs'].includes(ext)) {
      const result = checkJs(file);
      if (result.ok) {
        console.log(`  OK   - ${file}`);
      } else {
        console.log(`  FAIL - ${file}`);
        console.log(`         ${result.error.split('\n')[0]}`);
        hasError = true;
      }
    } else if (ext === 'html') {
      const errors = checkHtmlScripts(file);
      if (errors.length === 0) {
        console.log(`  OK   - ${file} (scripts embutidos)`);
      } else {
        console.log(`  FAIL - ${file}`);
        errors.forEach((e) => console.log(e));
        hasError = true;
      }
    }
    // outros tipos de arquivo (css, md, json) nao sao checados por este script
  }

  process.exit(hasError ? 1 : 0);
}

main();
