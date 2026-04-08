$htmlFiles = Get-ChildItem -Path "C:\Users\Henrique\Desktop\centrafin-app" -Filter "code.html" -Recurse

$newMenu = @"
<aside class="fixed left-0 top-0 h-full z-50 flex flex-col py-6 bg-secondary dark:bg-slate-950 w-64 shadow-xl dark:shadow-none">
<div class="p-4 mb-8 w-full flex items-center justify-center bg-secondary">
<img src="../assets/logo.png.png" alt="Logo" class="w-full h-auto object-contain drop-shadow-md" />
</div>
<nav class="flex-1 flex flex-col gap-1">
<a class="menu-link mx-2 px-4 py-3 flex items-center gap-3 transition-all duration-200" href="../dashboard_master_desktop/code.html">
<span class="material-symbols-outlined" data-icon="dashboard">dashboard</span>
<span class="font-inter text-sm font-semibold tracking-wide">Dashboard Principal</span>
</a>
<a class="menu-link mx-2 px-4 py-3 flex items-center gap-3 transition-all duration-200" href="../contas_a_pagar_desktop/code.html">
<span class="material-symbols-outlined" data-icon="account_balance_wallet">account_balance_wallet</span>
<span class="font-inter text-sm font-semibold tracking-wide">Contas a Pagar</span>
</a>
<a class="menu-link mx-2 px-4 py-3 flex items-center gap-3 transition-all duration-200" href="../contas_a_receber_desktop/code.html">
<span class="material-symbols-outlined" data-icon="payments">payments</span>
<span class="font-inter text-sm font-semibold tracking-wide">Contas a Receber</span>
</a>
<a class="menu-link mx-2 px-4 py-3 flex items-center gap-3 transition-all duration-200" href="../fornecedores_desktop/code.html">
<span class="material-symbols-outlined" data-icon="store">store</span>
<span class="font-inter text-sm font-semibold tracking-wide">Fornecedores</span>
</a>
<a class="menu-link mx-2 px-4 py-3 flex items-center gap-3 transition-all duration-200" href="../clientes_desktop/code.html">
<span class="material-symbols-outlined" data-icon="groups">groups</span>
<span class="font-inter text-sm font-semibold tracking-wide">Clientes</span>
</a>
<a class="menu-link mx-2 px-4 py-3 flex items-center gap-3 transition-all duration-200" href="../extrato_desktop/code.html">
<span class="material-symbols-outlined" data-icon="receipt_long">receipt_long</span>
<span class="font-inter text-sm font-semibold tracking-wide">Extrato / Auditoria</span>
</a>
</nav>
<div class="mt-auto pt-6">
<a class="text-blue-100/70 hover:text-white mx-2 px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-all duration-200" href="#">
<span class="material-symbols-outlined" data-icon="help">help</span>
<span class="font-inter text-sm font-semibold tracking-wide">Central de Ajuda</span>
</a>
<div class="px-6 mt-6 flex items-center gap-3">
<div class="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white overflow-hidden">
<img alt="Perfil" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDbO6c9pWxUc-pW_3e2qSaR-s1ISlVGu186sfW9q3g9zm9PYnDpusHBwHLI8pt_svOb3GJP4vWvKuXx8rO-Ak6c64tBiU7UkpS_5f9HtU74fERezZVI7ksYYlcVroht727dNxlPvPEwcEjz97B38PR3gl0EdkVR7k2SmIe_bBaXO5LAnv8OgyoDteD6R4jCly3zHlfjMAt20D_A57OFBveYURtWnNS32JojepPn51ucteUOfKwqdmCL1E2DBsaFxQbT4AfScQ0iX90" />
</div>
<div class="flex flex-col">
<span class="text-xs font-bold text-white">Administrador</span>
<span class="text-[10px] text-blue-200/50">Diretor</span>
</div>
</div>
</div>
<script>
document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname.toLowerCase();
    const links = document.querySelectorAll('.menu-link');
    links.forEach(link => {
        const href = link.getAttribute('href').toLowerCase();
        let targetPath = href.replace('../', '').split('/')[0];
        if (href !== '#' && currentPath.includes(targetPath)) {
            link.className = 'menu-link bg-white/10 text-white rounded-md mx-2 px-4 py-3 flex items-center gap-3 scale-[0.99] transition-transform';
        } else {
            link.className = 'menu-link text-blue-100/70 hover:text-white mx-2 px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-all duration-200';
        }
    });
});
</script>
</aside>
"@

foreach ($file in $htmlFiles) {
    if ($file.FullName -match "mobile") { continue }
    $content = Get-Content -Raw $file.FullName
    if ($content -match "(?s)<aside.*?</aside>") {
        $content = $content -replace "(?s)<aside.*?</aside>", $newMenu
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8
    }
}
