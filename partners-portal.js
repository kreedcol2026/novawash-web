const PARTNER_API_URL = 'https://script.google.com/macros/s/AKfycbxlF0G6qgbr4We9HK5EthJ0slWw90JYZtbjJk9j65KIDV88SmMoI4_nYmTLKVLVRHj6Mg/exec';
const SESSION_KEY = 'novaWashPartnerSession';
const money = new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0});
const date = new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short',year:'numeric'});
const $ = id => document.getElementById(id);
const copy = value => value === null || value === undefined || value === '' ? '—' : String(value);

async function api(action,payload={}){
  const response = await fetch(PARTNER_API_URL,{method:'POST',mode:'cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...payload})});
  if(!response.ok) throw new Error('No fue posible conectar con el portal.');
  const data = await response.json();
  if(!data?.ok) throw new Error(data?.error || 'Acceso no autorizado.');
  return data;
}
function safeDate(value){const parsed=new Date(value);return Number.isNaN(parsed.getTime())?copy(value):date.format(parsed)}
function drawChart(values){
  const series=Array.isArray(values)&&values.length?values:[{label:'Sin datos',value:0}]; const w=860,h=250,left=15,right=15,top=15,bottom=40;
  const max=Math.max(1,...series.map(item=>Number(item.value)||0)); const min=Math.min(0,...series.map(item=>Number(item.value)||0)); const range=Math.max(1,max-min);
  const x=i=>left+(i/Math.max(1,series.length-1))*(w-left-right); const y=v=>top+(max-v)/range*(h-top-bottom);
  const points=series.map((item,i)=>`${x(i).toFixed(1)},${y(Number(item.value)||0).toFixed(1)}`).join(' '); const area=`M${x(0)},${h-bottom} L${points.split(' ').join(' L')} L${x(series.length-1)},${h-bottom} Z`;
  const grid=[0,.5,1].map(n=>`<line class="grid" x1="${left}" x2="${w-right}" y1="${top+n*(h-top-bottom)}" y2="${top+n*(h-top-bottom)}"/>`).join('');
  $('portalChart').innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolución del rendimiento acumulado"><g>${grid}</g><path class="area" d="${area}"/><polyline class="line" points="${points}"/>${series.map((item,i)=>`<circle cx="${x(i)}" cy="${y(Number(item.value)||0)}" r="3.5" fill="#ff8000"/><text x="${x(i)}" y="${h-12}" text-anchor="middle">${copy(item.label)}</text>`).join('')}</svg>`;
}
function activate(){const requested=location.hash.slice(1);const view=['resumen','movimientos','proyecto'].includes(requested)?requested:'resumen';document.querySelectorAll('[data-portal-panel]').forEach(panel=>panel.hidden=panel.dataset.portalPanel!==view);document.querySelectorAll('[data-portal-view]').forEach(link=>link.toggleAttribute('aria-current',link.dataset.portalView===view));}
function render(portal){
  const p=portal.partner||portal; const summary=p.summary||{}; $('portalUserName').textContent=copy(p.name); $('portalGreetingName').textContent=copy(p.name).split(' ')[0];
  $('metricCapital').textContent=money.format(Number(summary.capitalInvested)||0); $('metricProject').textContent=copy(summary.project||p.project); $('metricReturn').textContent=money.format(Number(summary.accumulatedReturn)||0); $('metricReturnRate').textContent=summary.annualReturn ? `${summary.annualReturn} E.A. informado` : 'Rendimiento acumulado informado'; $('metricCut').textContent=safeDate(summary.nextCut); $('metricCutNote').textContent=copy(summary.nextCutNote||'Sujeto al cierre del periodo.');
  $('projectName').textContent=copy(summary.project||p.project); $('projectDate').textContent=safeDate(summary.memberSince||p.memberSince); $('projectStatus').textContent=copy(summary.status||p.status||'Activo'); $('projectCapitalStatus').textContent=copy(summary.capitalStatus||'Consulta las condiciones de tu contrato.');
  drawChart(portal.growth||p.growth); const movements=portal.movements||p.movements||[]; $('portalMovements').innerHTML=movements.map(item=>`<tr><td>${safeDate(item.date)}</td><td>${copy(item.concept)}</td><td>${copy(item.project)}</td><td>${money.format(Number(item.amount)||0)}</td><td><span class="movement-status">${copy(item.status)}</span></td></tr>`).join(''); $('portalEmptyMovements').hidden=movements.length>0; $('portalLoading').hidden=true; activate();
}
async function load(token){try{render(await api('getPartnerPortal',{token}));}catch(error){sessionStorage.removeItem(SESSION_KEY);$('portalLoading').hidden=true;$('portalError').textContent=error.message;$('portalError').hidden=false;$('partnerPortalView').hidden=true;$('partnerLoginView').hidden=false;}}
$('partnerLoginForm').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');const message=$('partnerLoginMessage');button.disabled=true;button.textContent='Validando...';message.textContent='';try{const data=await api('partnerLogin',{email:form.email.value.trim().toLowerCase(),password:form.password.value});if(!data.token) throw new Error('El acceso no devolvió una sesión válida.');sessionStorage.setItem(SESSION_KEY,data.token);$('partnerLoginView').hidden=true;$('partnerPortalView').hidden=false;await load(data.token);}catch(error){message.textContent=error.message;}finally{button.disabled=false;button.innerHTML='Ingresar al panel <span>→</span>';}});
$('partnerLogout').addEventListener('click',()=>{sessionStorage.removeItem(SESSION_KEY);location.hash='';$('partnerPortalView').hidden=true;$('partnerLoginView').hidden=false;$('partnerLoginForm').reset();});window.addEventListener('hashchange',activate);const token=sessionStorage.getItem(SESSION_KEY);if(token){$('partnerLoginView').hidden=true;$('partnerPortalView').hidden=false;load(token);}
