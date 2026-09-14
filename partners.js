import { DEFAULTS, SCENARIOS, project, csv } from './partners-model.js';

const money = new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 });
const percent = new Intl.NumberFormat('es-CO', { style:'percent', maximumFractionDigits:2 });
const cop = n => money.format(n);
const $ = id => document.getElementById(id);
const numericKeys = Object.keys(DEFAULTS).filter(k => k !== 'scenario');
function queryConfig() {
  const params = new URLSearchParams(location.search);
  const c = { ...DEFAULTS };
  for (const key of numericKeys) if (params.has(key)) c[key] = Number(params.get(key));
  if (params.has('scenario')) c.scenario = params.get('scenario');
  return c;
}
function scenarioURL(page, config) {
  const params = new URLSearchParams();
  for (const key of Object.keys(DEFAULTS)) params.set(key, String(config[key]));
  return `${page}?${params}`;
}
function download(model) {
  const meta = `Aporte COP;${model.config.investment}\r\nMeta de ronda COP;${model.funding}\r\nEscenario;${SCENARIOS[model.config.scenario].label}\r\nLavaderos;${model.config.sites}\r\nMontaje por unidad COP;${model.config.setup}\r\nCapital trabajo por unidad COP;${model.config.working}\r\nReparto partners porcentaje;${model.config.investorShare}\r\nProvision porcentaje;${model.config.provision}\r\nReserva porcentaje;${model.config.reserve}\r\nNo incluye devolucion de capital ni retenciones personales\r\n`;
  const url = URL.createObjectURL(new Blob(['\uFEFF' + meta + csv(model).replace('\uFEFF','')], {type:'text/csv;charset=utf-8;'}));
  const a = document.createElement('a'); a.href = url; a.download = 'NovaWash-proyeccion-NO-REAL.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function chart(rows, label = 'Utilidades acumuladas simuladas') {
  const width = 560, height = 190, left = 68, right = 12, top = 16, bottom = 30;
  const max = Math.max(100000, ...rows.map(r => r.accrued));
  const points = [{ month:0, accrued:0 }, ...rows];
  const x = m => left + m / rows.length * (width-left-right);
  const y = v => height-bottom - v / max * (height-top-bottom);
  const path = points.map((r,i) => `${i?'L':'M'}${x(r.month).toFixed(1)},${y(r.accrued).toFixed(1)}`).join(' ');
  const grid = [0,.5,1].map(n => `<line x1="${left}" y1="${y(n*max)}" x2="${width-right}" y2="${y(n*max)}" stroke="#e5e8eb"/><text x="${left-8}" y="${y(n*max)+4}" text-anchor="end">${(n*max/1000000).toLocaleString('es-CO',{maximumFractionDigits:2})} M</text>`).join('');
  return `<svg class="p-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}: ${cop(rows.at(-1).accrued)} al mes ${rows.length}">${grid}<path d="${path}" fill="none" stroke="#e87900" stroke-width="3" stroke-linejoin="round"/><circle cx="${x(rows.length)}" cy="${y(rows.at(-1).accrued)}" r="4" fill="#e87900"/><text x="${left}" y="${height-6}">Mes 0</text><text x="${width-right}" y="${height-6}" text-anchor="end">Mes ${rows.length}</text></svg>`;
}
function fundingRisk(model) {
  return model.shortfall > 0 ? `<p class="p-error"><strong>Capital de trabajo insuficiente en este escenario.</strong> Déficit operativo máximo estimado: ${cop(model.shortfall)} en la red. Los resultados posteriores son teóricos y no serían viables sin cubrir ese déficit. No hay financiación adicional confirmada.</p>` : '<p class="p-small">La caja operativa modelada se mantiene positiva. Esto no cubre desviaciones del presupuesto, retrasos ni riesgos no modelados.</p>';
}
const form = $('projectionForm');
if (form) {
  let current;
  try {
    const c = project(queryConfig()).config;
    for (const key of numericKeys) form.elements.namedItem(key).value = c[key];
    form.elements.namedItem('scenario').value = c.scenario;
  } catch { $('projectionError').textContent = 'El enlace tenía supuestos inválidos. Se muestra la propuesta inicial.'; $('projectionError').hidden = false; }
  function render() {
    const data = new FormData(form);
    const config = Object.fromEntries(numericKeys.map(k => [k, data.get(k) === '' ? NaN : Number(data.get(k))]));
    config.scenario = data.get('scenario');
    try { current = project(config); }
    catch (e) {
      current = null; $('projectionError').textContent = e.message; $('projectionError').hidden = false;
      $('projectionResults').innerHTML = '<p>Revisa los campos para calcular una proyección válida.</p>';
      $('projectionRows').replaceChildren(); $('downloadProjection').disabled = true; $('openDemo').hidden = true; return;
    }
    $('projectionError').hidden = true; $('downloadProjection').disabled = false; $('openDemo').hidden = false;
    $('investmentRange').max = String(current.funding); $('investmentRange').value = config.investment; $('investment').max = String(current.funding);
    const r = current.rows[12];
    $('projectionResults').innerHTML = `<p class="p-demo-stamp">ESCENARIO ${SCENARIOS[config.scenario].label.toUpperCase()} · HIPOTÉTICO</p><div class="p-kpi-label">Primer pago estimado · mes 12</div><div class="p-big">${cop(current.firstPayment)}</div><p class="p-small">${percent.format(current.firstYearYield)} del aporte durante el primer año, con arranque gradual.</p><div class="p-stat-row"><div><div class="p-kpi-label">Desde el mes 13</div><strong>${cop(current.steadyPayment)}</strong><div class="p-small">por mes, si se cumple el escenario</div></div><div><div class="p-kpi-label">Año maduro, sin reinvertir</div><strong>${percent.format(current.steadyYield)}</strong><div class="p-small">simple anual · no garantizado</div></div></div>${chart(current.rows.slice(0,24))}<div class="p-chart-caption"><span>Utilidades acumuladas · no valor del capital</span><span>24 meses</span></div><div class="p-budget"><div><span>Meta de la ronda</span><strong>${cop(current.funding)}</strong></div><div><span>Tu peso en el grupo partner</span><strong>${percent.format(current.weight)}</strong></div><div><span>Tu parte de todo lo distribuible</span><strong>${percent.format(current.effectiveShare)}</strong></div></div><details class="p-assumptions"><summary>Así se calcula un mes maduro</summary><div class="p-waterfall"><div><span>Resultado operativo red</span><strong>${cop(r.operating)}</strong></div><div><span>Base tras compensar pérdidas</span><strong>${cop(r.eligible)}</strong></div><div><span>Provisiones adicionales</span><strong>−${cop(r.provisions)}</strong></div><div><span>Reserva de reinversión</span><strong>−${cop(r.reserve)}</strong></div><div><span>Utilidad distribuible</span><strong>${cop(r.distributable)}</strong></div><div><span>Grupo partner (${config.investorShare}%)</span><strong>${cop(r.partners)}</strong></div><div><span>NovaWash (${100-config.investorShare}%)</span><strong>${cop(r.operator)}</strong></div><div><span>Tu parte del grupo</span><strong>${cop(r.earned)}</strong></div></div></details>${fundingRisk(current)}<p class="p-small">Antes de retenciones personales. No incluye devolución ni valorización del aporte. Los pagos reales dependerían de utilidades aprobadas, caja y contrato.</p>`;
    $('projectionRows').innerHTML = current.rows.map(r => `<tr><th scope="row">${r.month}</th><td>${cop(r.sales)}</td><td class="${r.operating<0?'p-negative':''}">${cop(r.operating)}</td><td>${cop(r.earned)}</td><td>${cop(r.payment)}</td></tr>`).join('');
    $('openDemo').href = scenarioURL('socios.html', current.config);
  }
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', render);
  $('investmentRange').addEventListener('input', e => { $('investment').value = e.target.value; render(); });
  form.addEventListener('reset', () => setTimeout(render,0));
  $('downloadProjection').addEventListener('click', () => { if (current) download(current); });
  render();
}

if ($('partnerDashboard')) {
  let config = queryConfig(), current;
  try { current = project(config); } catch { config = {...DEFAULTS}; current = project(config); $('demoError').textContent = 'El enlace contenía valores inválidos; se cargó el escenario inicial.'; $('demoError').hidden = false; }
  $('demoMonth').innerHTML = Array.from({length:36},(_,i)=>`<option value="${i+1}" ${i===11?'selected':''}>Mes ${i+1}${i===11?' · Anual':''}</option>`).join('');
  $('demoScenario').value = config.scenario;
  function renderDemo() {
    config.scenario = $('demoScenario').value; current = project(config);
    const month = Number($('demoMonth').value), r = current.rows[month-1];
    document.querySelector('.p-header .p-button').href = scenarioURL('partners.html',config)+'#simulador';
    $('demoDescription').textContent = `${SCENARIOS[config.scenario].label} · ${config.sites} ${config.sites===1?'unidad modelo':'unidades modelo'} · Peso del aporte: ${percent.format(current.weight)} del grupo partner · Reparto al grupo: ${config.investorShare}%.`;
    $('demoMetrics').innerHTML = [ ['Aporte simulado',cop(config.investment),'Costo inicial, no valor de mercado'], ['Utilidad acumulada estimada',cop(r.accrued),`Meses 1–${month} · no garantizada`], ['Pagos acumulados simulados',cop(r.paid),'No son transferencias reales'] ].map(([label,value,note])=>`<article class="p-metric"><p class="p-kpi-label">${label}</p><p class="p-big">${value}</p><p class="p-small">${note}</p></article>`).join('');
    $('demoChart').innerHTML = chart(current.rows.slice(0,month));
    const nextMonth = month < 12 ? 12 : month+1;
    const nextPayment = (current.rows[nextMonth-1] ?? current.rows[35]).payment;
    $('demoNextPayment').innerHTML = `<p class="p-kpi-label">Próxima ventana propuesta · mes ${nextMonth}</p><p class="p-big">${cop(nextPayment)}</p><p class="p-small">Estimado, sujeto a utilidad aprobada y caja. Puede ser cero.</p><div class="p-budget"><div><span>Pendiente hipotético</span><strong>${cop(r.pending)}</strong></div><div><span>Permanencia mínima</span><strong>${Math.max(0,24-month)} meses</strong></div></div><p class="p-small">${month<24?'No hay retiro de capital habilitado.':'Plazo mínimo cumplido en la simulación; no implica devolución automática.'}</p>${fundingRisk(current)}`;
    $('networkCaption').textContent = `Mes ${month} · Datos ficticios · ${config.sites} unidades incluidas en la ronda`;
    $('networkRows').innerHTML = Array.from({length:config.sites},(_,i)=>`<tr><th scope="row">Unidad modelo ${String(i+1).padStart(2,'0')}</th><td>${cop(r.sales/config.sites)}</td><td>${cop(r.costs/config.sites)}</td><td class="${r.operating<0?'p-negative':''}">${cop(r.operating/config.sites)}</td></tr>`).join('');
    $('networkTotal').innerHTML = `<tr><th scope="row">Total red simulada</th><td>${cop(r.sales)}</td><td>${cop(r.costs)}</td><td>${cop(r.operating)}</td></tr>`;
    $('demoWaterfall').innerHTML = [['Resultado operativo de la red',r.operating],['Pérdidas pendientes de compensar',r.losses],['Base del mes tras compensación',r.eligible],['Provisiones',r.provisions],['Reserva de reinversión',r.reserve],['Distribuible de la red',r.distributable],[`Grupo partner (${config.investorShare}%)`,r.partners],[`NovaWash (${100-config.investorShare}%)`,r.operator],['Utilidad de tu aporte en el mes',r.earned]].map(([label,value])=>`<div><span>${label}</span><strong>${cop(value)}</strong></div>`).join('');
    $('distributionRows').innerHTML = current.rows.slice(0,month).map(r=>`<tr><th scope="row">Mes ${r.month}</th><td>${cop(r.earned)}</td><td>${cop(r.payment)}</td><td>${cop(r.paid)}</td><td>${r.month<12?'Acumulación, sin pago':r.payment===0?'Sin utilidad repartible':r.month===12?'Primer pago anual simulado':'Pago mensual simulado'}</td></tr>`).join('');
  }
  function activate() {
    const requested = location.hash.slice(1), allowed = ['resumen','lavaderos','distribuciones','beneficios','documentos'];
    const view = allowed.includes(requested) ? requested : 'resumen';
    document.querySelectorAll('[data-partner-panel]').forEach(el => { el.hidden = el.dataset.partnerPanel !== view; });
    document.querySelectorAll('[data-partner-view]').forEach(el => { if(el.dataset.partnerView===view) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
  }
  window.addEventListener('hashchange', activate);
  $('demoMonth').addEventListener('change',renderDemo); $('demoScenario').addEventListener('change',renderDemo);
  $('downloadDemo').addEventListener('click',()=>download(current));
  renderDemo(); activate();
}
