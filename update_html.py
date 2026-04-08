import os
import re

desktop_files = [
    "dashboard_master_desktop/code.html",
    "contas_a_pagar_desktop/code.html",
    "contas_a_receber_desktop/code.html",
    "extrato_desktop/code.html",
    "gest_o_de_cadastros_ajuste_de_cores/code.html"
]

mobile_files = [
    "dashboard_master_mobile/code.html",
    "contas_a_pagar_mobile/code.html",
    "contas_a_receber_mobile/code.html",
    "gest_o_de_cadastros_mobile_ajustado/code.html"
]

new_title = "<title>CentraFin | Gestão Financeira</title>"
new_aside = """<aside class=\"fixed left-0 top-0 h-full z-50 flex flex-col py-6 bg-[#002443] w-64 shadow-xl\">
<div class=\"p-4 mb-8 w-full flex items-center justify-center bg-[#002443]\">
<img src=\"../assets/logo.png.png\" alt=\"Logo Soulan\" class=\"w-full h-auto object-contain drop-shadow-md\" />
</div>
<nav class=\"flex-1 flex flex-col gap-1\">
<a class=\"text-blue-100/70 hover:text-white mx-2 px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-all duration-200\" href=\"../dashboard_master_desktop/code.html\">
<span class=\"material-symbols-outlined\" data-icon=\"dashboard\">dashboard</span>
<span class=\"font-inter text-sm font-semibold tracking-wide\">Dashboard Principal</span>
</a>
<a class=\"text-blue-100/70 hover:text-white mx-2 px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-all duration-200\" href=\"../contas_a_pagar_desktop/code.html\">
<span class=\"material-symbols-outlined\" data-icon=\"account_balance_wallet\">account_balance_wallet</span>
<span class=\"font-inter text-sm font-semibold tracking-wide\">Contas a Pagar</span>
</a>
<a class=\"text-blue-100/70 hover:text-white mx-2 px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-all duration-200\" href=\"../contas_a_receber_desktop/code.html\">
<span class=\"material-symbols-outlined\" data-icon=\"payments\">payments</span>
<span class=\"font-inter text-sm font-semibold tracking-wide\">Contas a Receber</span>
</a>
<a class=\"text-blue-100/70 hover:text-white mx-2 px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-all duration-200\" href=\"../gest_o_de_cadastros_ajuste_de_cores/code.html\">
<span class=\"material-symbols-outlined\" data-icon=\"domain\">domain</span>
<span class=\"font-inter text-sm font-semibold tracking-wide\">Fornecedores</span>
</a>
<a class=\"text-blue-100/70 hover:text-white mx-2 px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-all duration-200\" href=\"../gest_o_de_cadastros_ajuste_de_cores/code.html\">
<span class=\"material-symbols-outlined\" data-icon=\"group\">group</span>
<span class=\"font-inter text-sm font-semibold tracking-wide\">Clientes</span>
</a>
<a class=\"text-blue-100/70 hover:text-white mx-2 px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-all duration-200\" href=\"../extrato_desktop/code.html\">
<span class=\"material-symbols-outlined\" data-icon=\"receipt_long\">receipt_long</span>
<span class=\"font-inter text-sm font-semibold tracking-wide\">Extrato/Auditoria</span>
</a>
</nav>
</aside>"""

base_dir = r"c:\Users\Henrique\Desktop\centrafin-app"

all_files = desktop_files + mobile_files

for f in all_files:
    path = os.path.join(base_dir, f)
    if not os.path.exists(path):
        print(f"File not found: {path}")
        continue
    with open(path, "r", encoding="utf-8") as file:
        content = file.read()
    
    # Replace title everywhere
    content = re.sub(r"<title>.*?</title>", new_title, content, flags=re.DOTALL)
    
    # Replace aside only in desktop files
    if f in desktop_files:
        content = re.sub(r"<aside.*?</aside>", new_aside, content, flags=re.DOTALL)
        
    with open(path, "w", encoding="utf-8") as file:
        file.write(content)

print(f"Done modifying {len(all_files)} files.")
