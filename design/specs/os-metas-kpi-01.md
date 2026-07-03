# OS-METAS-KPI-01 — Spec de diff visual: KPIs consolidados na tela Metas

## Resumo
Adicionar 2 cards de KPI (Meta Anual Total Bruto + Meta Anual Total Real)
entre o header da secao (linha 105) e a tabela (linha 107) em
`metas_desktop/code.html`.

---

## O que MUDA

### Novo bloco: grid de 2 cards KPI
- **Posicao**: imediatamente apos o `</div>` do header (linha 105, fechamento do
  `div.flex.justify-between`), ANTES do `div.bg-white.rounded-2xl` da tabela
  (linha 107).
- **Container**: `<div id="kpi-metas-consolidado" class="grid grid-cols-2 gap-4 mb-6">`

### Card 1 — Meta Anual Total (Bruto)
- Fundo: `bg-brandDarkBlue`
- Cantos: `rounded-xl`
- Padding: `p-5`
- Icone: Material Symbols `receipt_long`, cor `text-brandLightBlue`, tamanho `text-2xl`
- Valor (id `kpi-total-bruto`): `text-2xl font-extrabold text-white`
- Label: `text-[10px] font-bold uppercase tracking-widest text-brandPaleBlue`
- Texto do label: "Meta Anual Bruta Total"
- Layout interno: flex-col com icone+valor na mesma linha (flex items-center gap-2)
  e label abaixo

### Card 2 — Meta Anual Total (Real)
- Mesma estrutura do Card 1, com diferencas:
- Icone: `savings`, cor `text-brandGreen`
- Valor (id `kpi-total-real`): `text-2xl font-extrabold text-brandGreen`
- Texto do label: "Meta Anual Real Total"

### Logica JS
- Apos `carregarMetas()` renderizar a tabela (dentro do mesmo try, apos montar
  `tbody.innerHTML`), somar `total_bruto` e `total` de todas as metas filtradas
  pelo ano selecionado e atualizar `#kpi-total-bruto` e `#kpi-total-real` com
  `formatMoeda()`.
- Quando nao ha metas no ano, os KPIs devem exibir `R$ 0,00`.

---

## O que fica INTOCADO
- Header da pagina (linhas 86-89): titulo + barra sticky — nao mexer.
- Subtitulo + botao "Cadastrar Nova Meta" (linhas 92-105): nao mexer.
- Tabela de metas (linhas 107-135): estrutura, colunas, zebra — nao mexer.
- Modal de cadastro/edicao (linhas 139-226): nao mexer.
- Modal de alerta (linhas 228-239): nao mexer.
- Toda a logica de CRUD existente: nao mexer.
- Tailwind config inline (linhas 13-24): nao mexer (cores brand ja declaradas).
- Estilos inline `<style>` (linhas 25-63): nao mexer.

---

## Tokens / classes utilizados e justificativa

| Elemento           | Classe/Token                          | Origem                                  |
|--------------------|---------------------------------------|-----------------------------------------|
| Fundo do card      | `bg-brandDarkBlue`                    | Tailwind config inline (linha 18)       |
| Dark mode do fundo | `html.dark .bg-brandDarkBlue`         | theme.css linha 62 (`#001a32`)          |
| Texto valor bruto  | `text-white`                          | Padrao Tailwind; inverte ok no dark     |
| Texto valor real   | `text-brandGreen` (`#aad12f`)         | Tailwind config inline (linha 18)       |
| Icone bruto        | `text-brandLightBlue` (`#59a4d8`)     | Tailwind config inline (linha 19)       |
| Icone real         | `text-brandGreen`                     | Tailwind config inline (linha 18)       |
| Label              | `text-brandPaleBlue` (`#bfd7ea`)      | Tailwind config inline (linha 19)       |
| Cantos             | `rounded-xl`                          | Padrao do sistema                       |
| Sombra             | nenhuma extra (card flat sobre fundo) | Coerente com o rodape do modal (ln 205) |

**Nenhum hex/rgb hardcoded.** Todas as cores sao brand tokens ja existentes.

---

## Padrao equivalente reutilizado

O rodape do modal de meta (linha 205 do mesmo arquivo) ja usa exatamente esta
composicao: `grid grid-cols-2 gap-4 bg-brandDarkBlue p-4 rounded-xl` com labels
`text-brandPaleBlue text-[10px] font-bold uppercase tracking-widest` e valores
`text-brandLightBlue font-extrabold` / `text-brandGreen font-extrabold`.

O engenheiro deve REUSAR esse padrao visual. A unica diferenca e o padding
ligeiramente maior (`p-5` vs `p-4`) e o tamanho do valor (`text-2xl` vs `text-xl`)
para dar mais destaque numa area de pagina vs rodape de modal.

---

## Tema escuro — riscos e mitigacao

- `bg-brandDarkBlue` ja tem override em theme.css (linha 62):
  `html.dark .bg-brandDarkBlue { background-color: #001a32 !important; }` — OK.
- `text-brandPaleBlue` e `text-brandLightBlue` sao cores claras por natureza —
  legiveis sobre fundo escuro sem override adicional — OK.
- `text-brandGreen` (`#aad12f`) tem luminosidade alta — legivel em ambos os
  temas — OK.
- `text-white` sobre `#001a32` (dark) = contraste excelente — OK.
- **Nenhum risco identificado para o tema escuro.**

---

## Responsividade
- `grid-cols-2` funciona bem em telas >= tablet. Em mobile extremo (< 640px),
  considerar `grid-cols-1 sm:grid-cols-2` se necessario, mas a tela de metas
  ja assume largura desktop (sidebar 80px + main). Risco baixo.
