/**
 * test-col-salario.cjs — Prova numérica completa (CLT + PJ mesclados).
 * Replica a mesclagem de produção: CustosFolha + ContasAPagar (PJ Interno)
 * + CP_Beneficios_PJ (enriquecimento CLT + benefícios PJ).
 */
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
admin.initializeApp({ projectId: 'centra-fin' });
const db = getFirestore();

// ── Funções de cálculo (réplica de core_rules.js) ──
function _ht(k,t){return new RegExp('(^|_)'+t+'(_|$)').test(k)}
const SP=new Set(['VALE_TRANSPORTE_Valor','VALE_REFEICAO_Valor','ASSISTENCIA_MEDICA_Valor','ASSISTENCIA_ODONTOLOGICA_Valor','VALE_ALIMENTACAO_Valor']);
const SD=new Set(['SEGURO_DE_VIDA_Valor','DESCTO_DE_VALE_TRANSPORTE_Valor','DEVOLUCAO_DE_VR_NAO_UTILIZADO_Valor','DESCTO_DE_VALE_REFEICAO_Valor','DESCTO_DE_ASSISTENCIA_MEDICA_Valor']);
function isV(k){var key=String(k||'').toUpperCase();if(key.endsWith('_QTDE'))return false;if(key==='SALARIO_CADASTRAL')return false;var p=key.includes('PRO_LABORE')||key.includes('PROLABORE');if(p){if(key.startsWith('DESC_')||key.startsWith('DESCTO_'))return false;if(key.includes('DESCONTO'))return false;if(key.startsWith('BASE_'))return false;return true}if(key.includes('INSS')||key.includes('IRRF')||key.includes('DESCONTO')||key.includes('EDUCACAO')||key.includes('FGTS')||key.includes('BASE_'))return false;return['SALARIO','PRO_LABORE','DSR','CRECHE','COMISSAO','BANCO_DE_HORAS','ARREDONDAMENTO','REEMBOLSO','AVISO_PREVIO','FERIAS','1_3','EMPRESTIMO_SALDO_NEGATIVO','13O','AJUDA_DE_CUSTO','RESCISAO','HORA_EXTRA','PARTICIPACAO','LUCRO','BONUS','PREMIO','PREMIACAO','GRATIFICACAO','SERVICOS_PRESTADOS','BOLSA_AUXILIO','DIFERENCA'].some(w=>key.includes(w))}
function isE(k){var key=String(k||'').toUpperCase();if(key.endsWith('_QTDE'))return false;if(key.startsWith('BASE_'))return false;if(key.startsWith('DESC_')||key.startsWith('DESCTO_'))return false;if(key.includes('DESCONTO'))return false;if(key.includes('PRO_LABORE')||key.includes('PROLABORE'))return false;if(_ht(key,'IRRF')||_ht(key,'IR_RETIDO'))return false;if(key.includes('SINDIC'))return false;if(_ht(key,'CONTRIBUICAO_ASSISTENCIAL'))return false;if(_ht(key,'INSS_RETIDO'))return false;if(_ht(key,'INSS')&&!key.includes('PATRONAL'))return false;return['INSS_PATRONAL','FGTS','TERCEIROS','RAT','FAP','SISTEMA_S'].some(t=>_ht(key,t))}
function isDFI(k){var key=String(k||'').toUpperCase();if(key.endsWith('_QTDE'))return false;if(key.startsWith('BASE_'))return false;if(_ht(key,'INSS')&&!key.includes('PATRONAL'))return true;if(_ht(key,'IRRF')||_ht(key,'IR_RETIDO'))return true;if(key.includes('SINDIC'))return true;if(_ht(key,'CONTRIBUICAO_ASSISTENCIAL'))return true;if(_ht(key,'MULTA_ART_480_CLT'))return true;if(_ht(key,'HORAS_NAO_COMPENSADAS'))return true;if(key.startsWith('DESC_EMPRESTIMO_CONSIGNADO'))return true;return false}
function isBD(k){if(SD.has(k))return true;var key=String(k||'').toUpperCase();if(key.endsWith('_QTDE'))return false;if(key.startsWith('BASE_'))return false;var d=key.startsWith('DESC_')||key.startsWith('DESCTO_')||key.includes('DESCONTO');if(d&&key.includes('ODONTOL'))return true;return false}
function isSBK(k){var key=String(k||'').normalize('NFD').replace(/[\u0300-\u036f\s_]/g,'').toUpperCase();if(!key)return false;if(key.startsWith('DESC')||key.startsWith('DESCTO'))return false;if(key.includes('DESCONTO'))return false;if(key.startsWith('BASE'))return false;if(key==='SALARIOCADASTRAL')return false;if(key.includes('PROLABORE'))return true;if(key.includes('SERVICOSPRESTADOS'))return true;if(key.includes('BOLSAAUXILIO'))return true;if(key.includes('SALARIOBASE'))return true;if(key.includes('SALARIOFAMILIA'))return true;if(key.includes('SALARIOMATERNIDADE'))return true;if(key==='SALARIO'||key==='SALARIOVALOR')return true;return false}
function calc(reg){var v=0,e=0,b=0,d=0,sb=0;var txt=(reg&&reg._has_benef_txt===true);for(var k of Object.keys(reg||{})){var raw=reg[k];if(typeof raw!=='number'||!Number.isFinite(raw))continue;if(isDFI(k))continue;if(isE(k)){e+=raw;continue}if(k.startsWith('Bnf_')){b+=raw;continue}if(k.startsWith('BnfDesc_')){d+=raw;continue}if(!txt&&SP.has(k)){b+=raw;continue}if(!txt&&isBD(k)){d+=raw;continue}if(isV(k)){v+=raw;if(isSBK(k))sb+=raw;continue}}return{total:v+e+b-d,v,e,b,d,sb}}

// ── Funções de mesclagem PJ (réplica de produção) ──
function normComp(raw,fb){var s=String(raw||'').trim();var m=s.match(/^(\d{4})-(\d{2})$/);if(m)return s;m=s.match(/^(\d{2})\/(\d{4})$/);if(m)return m[2]+'-'+m[1];var mv=String(fb||'').match(/^(\d{4})-(\d{2})/);if(mv)return mv[1]+'-'+mv[2];return''}
function empCanonica(e){var emp=String(e||'').trim();if(!emp)return emp;var c=emp.toUpperCase().replace(/\s+/g,' ').trim();if(c==='SOULAN CONSULTORIA 3')return'SOULAN CONSULTORIA';if(c==='PJ')return'SOULAN CONSULTORIA';return emp}
function resolverEmpresa(codForn,data,caches){var _n=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();var _d=s=>String(s||'').replace(/\D/g,'');var emp='';if(codForn!=null&&caches.porCodigo.has(String(codForn)))emp=caches.porCodigo.get(String(codForn));if(!emp&&data){var doc=_d(data.cnpj||data.cpf||data.cnpj_cpf||data.documento);if(doc&&caches.porDoc.has(doc))emp=caches.porDoc.get(doc)}if(!emp&&data){var nm=_n(data.entidade||data.favorecido||data.nome);if(nm&&caches.porNome.has(nm))emp=caches.porNome.get(nm)}if(!emp&&data&&data.empresa)emp=String(data.empresa);emp=empCanonica(emp);return emp||'SOULAN CONSULTORIA'}

const fmt = v => 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

(async()=>{
  // 1) Fornecedores → caches de empresa
  const fornSnap=await db.collection('Fornecedores').get();
  const porCodigo=new Map(),porDoc=new Map(),porNome=new Map(),fornCC=new Map();
  const _n=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
  const _d=s=>String(s||'').replace(/\D/g,'');
  fornSnap.forEach(d=>{const data=d.data()||{};const codigo=String(data.codigo!=null?data.codigo:d.id);const idDoc=String(d.id||'').trim();const cc=String(data.centro_custo||'').trim();if(cc)fornCC.set(codigo,cc);const emp=String(data.empresa||'').trim().toUpperCase();if(emp){porCodigo.set(codigo,emp);if(idDoc&&idDoc!==codigo)porCodigo.set(idDoc,emp);const doc=_d(data.cnpj||data.cpf||data.cnpj_cpf||data.documento);if(doc)porDoc.set(doc,emp);const nm=_n(data.nome||data.nome_fantasia||data.razao_social||data.entidade);if(nm)porNome.set(nm,emp)}});
  const caches={porCodigo,porDoc,porNome};

  // 2) Benefícios PJ → mapMatricula (enriquecimento CLT) + mapFull (PJ)
  const bnfSnap=await db.collection('CP_Beneficios_PJ').get();
  const mapMatricula=new Map(),mapFull=new Map();
  bnfSnap.forEach(d=>{const data=d.data()||{};const comp=String(data.competencia||'').trim();const fid=String(data.fornecedor_id||'').trim();const mat=String(data.fil_codigo||'').trim().replace(/^0+/,'');if(!comp||!mat)return;
    if(fid&&fid!=='ORFAO'){const ch=comp+'_'+fid;const valor=Number(data.valor_total)||0;if(valor>0){const prev=mapFull.get(ch)||{valor_vt:0,valor_vr:0,valor_va:0,valor_med:0,valor_odonto:0,desconto_vt:0,desconto_vr:0,desconto_va:0,desconto_med:0,desconto_odonto:0,nome:'',centro_custo:''};mapFull.set(ch,{valor_vt:prev.valor_vt+(Number(data.valor_vt)||0),valor_vr:prev.valor_vr+(Number(data.valor_vr)||0),valor_va:prev.valor_va+(Number(data.valor_va)||0),valor_med:prev.valor_med+(Number(data.valor_med)||0),valor_odonto:(prev.valor_odonto||0)+(Number(data.valor_odonto)||0),desconto_vt:prev.desconto_vt+(Number(data.desconto_vt)||0),desconto_vr:prev.desconto_vr+(Number(data.desconto_vr)||0),desconto_va:prev.desconto_va+(Number(data.desconto_va)||0),desconto_med:prev.desconto_med+(Number(data.desconto_med)||0),desconto_odonto:(prev.desconto_odonto||0)+(Number(data.desconto_odonto)||0),nome:String(data.nome_fornecedor||prev.nome||'').trim(),centro_custo:String(data.centro_custo||prev.centro_custo||'').trim()})}}
    mapMatricula.set(comp+'_'+mat,{vt_pago:Number(data.valor_vt||0),vr_pago:Number(data.valor_vr||0),va_pago:Number(data.valor_va||0),med_pago:Number(data.valor_med||0),odonto_pago:Number(data.valor_odonto||0),desconto_vt:Number(data.desconto_vt||0),desconto_vr:Number(data.desconto_vr||0),desconto_va:Number(data.desconto_va||0),desconto_med:Number(data.desconto_med||0),desconto_odonto:Number(data.desconto_odonto||0)})});

  // 3) CLTs + enriquecimento
  const cltSnap=await db.collection('CustosFolha').get();
  const clts=[];
  cltSnap.forEach(d=>{const r={_id:d.id,...d.data()};
    // enriquecerCltComBeneficios
    if(!r.is_pj){const mat=String(r.matricula||r.codigo||r.chapa||'').trim().toUpperCase().replace(/^0+/,'');const comp=String(r.competencia_ref||'').trim();if(mat&&comp){const ch=comp+'_'+mat;const b=mapMatricula.get(ch);if(b){r.Bnf_VT=Number(b.vt_pago)||0;r.Bnf_VR=Number(b.vr_pago)||0;r.Bnf_VA=Number(b.va_pago)||0;r.Bnf_MED=Number(b.med_pago)||0;r.Bnf_Odonto=Number(b.odonto_pago)||0;r.BnfDesc_VT=Number(b.desconto_vt)||0;r.BnfDesc_VR=Number(b.desconto_vr)||0;r.BnfDesc_VA=Number(b.desconto_va)||0;r.BnfDesc_MED=Number(b.desconto_med)||0;r.BnfDesc_Odonto=Number(b.desconto_odonto)||0;r._has_benef_txt=true}}}
    clts.push(r)});

  // 4) PJs consolidados (mesma lógica de _pjRebuildCache)
  const pjSnap=await db.collection('ContasAPagar').where('tipo_entidade','==','Fornecedor Interno - PJ').get();
  const grupos=new Map();
  pjSnap.forEach(d=>{const data=d.data()||{};const codForn=data.codigo_fornecedor!=null?String(data.codigo_fornecedor):d.id;const comp=normComp(data.competencia_ref,data.data_vencimento);const ch=comp+'_'+codForn;if(!grupos.has(ch)){const ccLanc=String(data.centro_custo||'').trim();const ccForn=fornCC.get(codForn)||'';grupos.set(ch,{_id:'pj_'+ch,is_pj:true,nome:data.entidade||data.favorecido||'—',empresa_atribuida:resolverEmpresa(codForn,data,caches),centro_custo:ccLanc||ccForn||'',competencia_ref:comp,SERVICOS_PRESTADOS_Valor:0,Bnf_VT:0,Bnf_VR:0,Bnf_VA:0,Bnf_MED:0,Bnf_Odonto:0,BnfDesc_VT:0,BnfDesc_VR:0,BnfDesc_VA:0,BnfDesc_MED:0,BnfDesc_Odonto:0,salario_cadastral:0})}
    const g=grupos.get(ch);g.SERVICOS_PRESTADOS_Valor+=Number(data.valor_original)||0});
  // Benefícios PJ
  for(const[ch,full]of mapFull.entries()){if(!full)continue;const sep=ch.lastIndexOf('_');if(sep<0)continue;const comp=ch.slice(0,sep);const fid=ch.slice(sep+1);if(!grupos.has(ch)){grupos.set(ch,{_id:'pj_'+ch,is_pj:true,nome:full.nome||'—',empresa_atribuida:'SOULAN CONSULTORIA',centro_custo:full.centro_custo||'',competencia_ref:comp,SERVICOS_PRESTADOS_Valor:0,Bnf_VT:0,Bnf_VR:0,Bnf_VA:0,Bnf_MED:0,Bnf_Odonto:0,BnfDesc_VT:0,BnfDesc_VR:0,BnfDesc_VA:0,BnfDesc_MED:0,BnfDesc_Odonto:0,salario_cadastral:0})}
    const g=grupos.get(ch);g.Bnf_VT=Number(full.valor_vt)||0;g.Bnf_VR=Number(full.valor_vr)||0;g.Bnf_VA=Number(full.valor_va)||0;g.Bnf_MED=Number(full.valor_med)||0;g.Bnf_Odonto=Number(full.valor_odonto)||0;g.BnfDesc_VT=Number(full.desconto_vt)||0;g.BnfDesc_VR=Number(full.desconto_vr)||0;g.BnfDesc_VA=Number(full.desconto_va)||0;g.BnfDesc_MED=Number(full.desconto_med)||0;g.BnfDesc_Odonto=Number(full.desconto_odonto)||0;g._has_benef_txt=true}

  // 5) Mesclar CLT + PJ
  const todos=[...clts,...grupos.values()];

  // 6) Calcular e reportar
  const porEmp=new Map();
  for(const r of todos){const emp=empCanonica(r.empresa_atribuida||'')||'Sem empresa';if(!porEmp.has(emp))porEmp.set(emp,{t:0,v:0,e:0,b:0,d:0,sb:0,sc:0});const a=porEmp.get(emp);const t=calc(r);a.t+=t.total;a.v+=t.v;a.e+=t.e;a.b+=t.b;a.d+=t.d;a.sb+=t.sb;a.sc+=Number(r.salario_cadastral)||0}

  console.log('PROVA NUMÉRICA — OS-FOLHA-COL-SALARIO-01 (CLT+PJ mesclados)');
  console.log('='.repeat(90));

  // Global
  let gT=0,gV=0,gE=0,gB=0,gD=0,gSB=0,gSC=0;
  porEmp.forEach(a=>{gT+=a.t;gV+=a.v;gE+=a.e;gB+=a.b;gD+=a.d;gSB+=a.sb;gSC+=a.sc});
  console.log('GLOBAL (sem filtro):');
  console.log('  Custo Total:      '+fmt(gT));
  console.log('  Sal. Contrato:    '+fmt(gSC)+' (novo — informativo)');
  console.log();

  // NEAT
  const neat=porEmp.get('NEAT')||{t:0,v:0,e:0,b:0,d:0,sb:0,sc:0};
  console.log('NEAT (valores esperados pelo diretor):');
  console.log('  Custo Total:      '+fmt(neat.t)+' (esperado: R$ 1.039.360,17)');
  console.log('  Vencimentos:      '+fmt(neat.v)+' (esperado: R$ 901.377,52)');
  console.log('  Encargos:         '+fmt(neat.e)+' (esperado: R$ 63.340,87)');
  console.log('  Benef. Pagos:     '+fmt(neat.b)+' (esperado: R$ 85.198,97)');
  console.log('  Desc. Benef.:    -'+fmt(neat.d)+' (esperado: -R$ 10.557,19)');
  console.log('  Salário Bruto:    '+fmt(neat.sb)+' (esperado: R$ 785.761,69)');
  console.log('  Sal. Contrato:    '+fmt(neat.sc)+' (novo — informativo)');

  // SOULAN ADM
  const sadm=porEmp.get('SOULAN ADM')||{t:0,v:0,e:0,b:0,d:0,sb:0,sc:0};
  console.log('\nSOULAN ADM:');
  console.log('  Custo Total:      '+fmt(sadm.t));
  console.log('  Sal. Contrato:    '+fmt(sadm.sc)+' (novo — informativo)');

  try{require('fs').unlinkSync('adc_tmp.json')}catch(_){}
  process.exit(0);
})();
