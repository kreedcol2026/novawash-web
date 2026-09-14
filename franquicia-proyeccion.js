const inputs = ['area', 'hours', 'setup', 'franchiseFee'];
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
  rentPerTenSqm: 800000,
  utilities: 2000000,
  vehiclesPerLinePerHour: 8,
  operatingDaysPerMonth: 30,
};

const scenarios = [
  { key: 'bad', monthlyWashes: 2100, operators: 9 },
  { key: 'realistic', washesPerLine: 850 },
  { key: 'excellent', washesPerLine: 1200 },
];

const money = (amount) => cop.format(Math.round(amount));
const value = (id) => Math.max(0, Number(String(el[id].value).replace(/\D/g, '')) || 0);

function paybackLabel(months) {
  if (!Number.isFinite(months) || months <= 0) return 'No se recupera en este escenario';
  const roundedMonths = Math.ceil(months);
  if (roundedMonths < 12) return `${roundedMonths} ${roundedMonths === 1 ? 'mes' : 'meses'} aprox.`;
  const years = Math.floor(roundedMonths / 12);
  const remainingMonths = roundedMonths % 12;
  return remainingMonths ? `${years} año${years > 1 ? 's' : ''} y ${remainingMonths} meses aprox.` : `${years} año${years > 1 ? 's' : ''} aprox.`;
}

function renderScenario({ key, washesPerLine, monthlyWashes, operators: scenarioOperators }, lines, investment, rent, monthlyCapacity) {
  const targetWashes = monthlyWashes ?? (lines * washesPerLine);
  const vehicles = Math.min(targetWashes, monthlyCapacity);
  const revenue = vehicles * fixed.ticket;
  const consumables = vehicles * fixed.consumables;
  const fees = revenue * fixed.feesRate;
  const operators = lines > 0 ? (scenarioOperators ?? (lines * fixed.staffPerLine)) : 0;
  const cashiers = lines > 0 ? Math.ceil(lines / 10) : 0;
  const payroll = (operators + cashiers) * fixed.staffCost;
  const fixedCosts = rent + fixed.utilities;
  const costs = consumables + fees + payroll + fixedCosts;
  const profit = revenue - costs;
  const annual = profit * 12;
  const roi = investment > 0 ? (annual / investment) * 100 : null;
  const payback = investment > 0 && profit > 0 ? investment / profit : null;

  out(`${key}Volume`).textContent = integer.format(vehicles);
  out(`${key}Revenue`).textContent = money(revenue);
  out(`${key}Team`).textContent = `${operators} operarios + ${cashiers} cajero${cashiers === 1 ? '' : 's'}`;
  out(`${key}Investment`).textContent = money(investment);
  out(`${key}Costs`).textContent = `− ${money(costs)}`;
  out(`${key}Consumables`).textContent = `− ${money(consumables)}`;
  out(`${key}Fees`).textContent = `− ${money(fees)}`;
  out(`${key}Payroll`).textContent = `− ${money(payroll)}`;
  out(`${key}Rent`).textContent = `− ${money(rent)}`;
  out(`${key}Utilities`).textContent = `− ${money(fixed.utilities)}`;
  out(`${key}Profit`).textContent = money(profit);
  out(`${key}Annual`).textContent = money(annual);
  out(`${key}Roi`).textContent = roi === null ? 'Rentabilidad anual por definir' : `${Math.round(roi)}% retorno anual simple sobre la inversión`;
  out(`${key}Payback`).textContent = investment === 0 ? 'Define la inversión inicial' : paybackLabel(payback);
}

function calculate() {
  const area = value('area');
  const hours = value('hours');
  const lines = Math.floor(area / fixed.sqmPerLine);
  const investment = value('setup') + value('franchiseFee');
  const rent = Math.ceil(area / 10) * fixed.rentPerTenSqm;
  const dailyPerLine = hours * fixed.vehiclesPerLinePerHour;
  const dailyTotal = dailyPerLine * lines;
  const monthlyTotal = dailyTotal * fixed.operatingDaysPerMonth;
  out('lines').textContent = `${integer.format(lines)} ${lines === 1 ? 'línea' : 'líneas'}`;
  out('capacityPerLine').textContent = `${integer.format(dailyPerLine)} vehículos/día por línea`;
  out('capacityTotal').textContent = `${integer.format(dailyTotal)} vehículos/día en todo el punto · ${integer.format(monthlyTotal)} al mes`;
  scenarios.forEach((scenario) => renderScenario(scenario, lines, investment, rent, monthlyTotal));
}

function formatCopInput(input) {
  const raw = value(input.id);
  input.value = `$ ${integer.format(raw)}`;
}

el.area.addEventListener('input', calculate);
el.hours.addEventListener('input', calculate);
['setup', 'franchiseFee'].forEach((id) => el[id].addEventListener('input', (event) => {
  formatCopInput(event.target);
  calculate();
}));
document.getElementById('franchiseCalculator').addEventListener('submit', (event) => event.preventDefault());
calculate();
