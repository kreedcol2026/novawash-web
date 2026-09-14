const inputs = ['area', 'setup', 'franchiseFee'];
const el = Object.fromEntries(inputs.map((id) => [id, document.getElementById(id)]));
const out = (id) => document.getElementById(id);
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('es-CO');

const fixed = {
  sqmPerLine: 35,
  ticket: 30000,
  consumables: 2500,
  feesRate: 0.05,
  staffPerLine: 3,
  staffCost: 2700000,
  rent: 7000000,
  utilities: 3000000,
};

const scenarios = [
  { key: 'bad', washesPerLine: 500 },
  { key: 'realistic', washesPerLine: 850 },
  { key: 'excellent', washesPerLine: 1200 },
];

const money = (amount) => cop.format(Math.round(amount));
const value = (id) => Math.max(0, Number(el[id].value) || 0);

function paybackLabel(months) {
  if (!Number.isFinite(months) || months <= 0) return 'No se recupera en este escenario';
  const roundedMonths = Math.ceil(months);
  if (roundedMonths < 12) return `${roundedMonths} ${roundedMonths === 1 ? 'mes' : 'meses'} aprox.`;
  const years = Math.floor(roundedMonths / 12);
  const remainingMonths = roundedMonths % 12;
  return remainingMonths ? `${years} año${years > 1 ? 's' : ''} y ${remainingMonths} meses aprox.` : `${years} año${years > 1 ? 's' : ''} aprox.`;
}

function renderScenario({ key, washesPerLine }, lines, investment) {
  const vehicles = lines * washesPerLine;
  const revenue = vehicles * fixed.ticket;
  const consumables = vehicles * fixed.consumables;
  const fees = revenue * fixed.feesRate;
  const operators = lines * fixed.staffPerLine;
  const cashiers = lines > 0 ? Math.ceil(lines / 10) : 0;
  const payroll = (operators + cashiers) * fixed.staffCost;
  const fixedCosts = fixed.rent + fixed.utilities;
  const costs = consumables + fees + payroll + fixedCosts;
  const profit = revenue - costs;
  const annual = profit * 12;
  const roi = investment > 0 ? (annual / investment) * 100 : null;
  const payback = investment > 0 && profit > 0 ? investment / profit : null;

  out(`${key}Volume`).textContent = integer.format(vehicles);
  out(`${key}Revenue`).textContent = money(revenue);
  out(`${key}Team`).textContent = `${operators} operarios + ${cashiers} cajero${cashiers === 1 ? '' : 's'}`;
  out(`${key}Costs`).textContent = `− ${money(costs)}`;
  out(`${key}Profit`).textContent = money(profit);
  out(`${key}Annual`).textContent = money(annual);
  out(`${key}Roi`).textContent = roi === null ? 'Rentabilidad anual por definir' : `${Math.round(roi)}% retorno anual simple sobre la inversión`;
  out(`${key}Payback`).textContent = investment === 0 ? 'Define la inversión inicial' : paybackLabel(payback);
}

function calculate() {
  const lines = Math.floor(value('area') / fixed.sqmPerLine);
  const investment = value('setup') + value('franchiseFee');
  out('lines').textContent = `${integer.format(lines)} ${lines === 1 ? 'línea' : 'líneas'}`;
  scenarios.forEach((scenario) => renderScenario(scenario, lines, investment));
}

inputs.forEach((id) => el[id].addEventListener('input', calculate));
document.getElementById('franchiseCalculator').addEventListener('submit', (event) => event.preventDefault());
calculate();
