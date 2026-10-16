const inputs = ['area', 'hours', 'setup', 'franchiseFee', 'linesInput', 'cashierType', 'propertyType', 'rent'];
const el = Object.fromEntries(inputs.map((id) => [id, document.getElementById(id)]));
const out = (id) => document.getElementById(id);
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('es-CO');
const decimal = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

const fixed = {
  minimumSqmForLine: 60,
  sqmPerAdditionalLine: 35,
  firstLineInvestment: 120000000,
  additionalLineInvestment: 75000000,
  automaticCashierInvestment: 18000000,
  ticket: 35000,
  consumables: 2500,
  feesRate: 0.05,
  staffPerLine: 2,
  staffCost: 2700000,
  manualCashierCost: 2700000,
  rentPerSqm: 150000,
  utilities: 2000000,
  vehiclesPerLinePerHour: 8,
  operatingDaysPerMonth: 30,
};

const scenarios = [
  { key: 'bad', capacityRate: 0.30 },
  { key: 'realistic', capacityRate: 0.50 },
  { key: 'excellent', capacityRate: 0.75 },
];

let rentCustomized = false;

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

function renderScenario({ key, capacityRate }, lines, investment, rent, monthlyCapacity, cashierType) {
  const targetWashes = Math.round(monthlyCapacity * capacityRate);
  const operators = lines > 0 ? lines * fixed.staffPerLine : 0;
  const cashiers = lines > 0 && cashierType === 'manual' ? 1 : 0;
  const payroll = (operators * fixed.staffCost) + (cashiers * fixed.manualCashierCost);
  const fixedCosts = rent + fixed.utilities;
  const contributionMargin = fixed.ticket - fixed.consumables - (fixed.ticket * fixed.feesRate);
  const breakEvenVehicles = contributionMargin > 0 ? Math.ceil((payroll + fixedCosts) / contributionMargin) : Infinity;
  const breakEvenApplied = key === 'bad' && targetWashes < breakEvenVehicles && breakEvenVehicles <= monthlyCapacity;
  const vehicles = breakEvenApplied ? breakEvenVehicles : Math.min(targetWashes, monthlyCapacity);
  const capacityPercentage = monthlyCapacity > 0 ? ((vehicles / monthlyCapacity) * 100) : 0;
  const averageDailyWashes = vehicles / fixed.operatingDaysPerMonth;
  const revenue = vehicles * fixed.ticket;
  const consumables = vehicles * fixed.consumables;
  const fees = revenue * fixed.feesRate;
  const costs = consumables + fees + payroll + fixedCosts;
  const profit = revenue - costs;
  const annual = profit * 12;
  const roi = investment > 0 ? (annual / investment) * 100 : null;
  const payback = investment > 0 && profit > 0 ? investment / profit : null;

  out(`${key}Volume`).textContent = integer.format(vehicles);
  out(`${key}VolumeCopy`).textContent = breakEvenApplied
    ? `Punto de equilibrio · ${decimal.format(capacityPercentage)}% de capacidad · vehículos estimados por mes`
    : `${Math.round(capacityRate * 100)}% de capacidad · vehículos estimados por mes`;
  if (key === 'bad') out('badTag').textContent = breakEvenApplied ? 'Punto de equilibrio' : 'Inicio';
  out(`${key}DailyWashes`).textContent = decimal.format(averageDailyWashes);
  out(`${key}Revenue`).textContent = money(revenue);
  const cashierLabel = cashierType === 'automatic'
    ? ' + cajero automático'
    : cashiers === 1 ? ' + 1 cajero manual' : '';
  out(`${key}Team`).textContent = `${operators} operarios${cashierLabel}`;
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

function maxLinesForArea(area) {
  if (area < fixed.minimumSqmForLine) return 0;
  return 1 + Math.floor((area - fixed.minimumSqmForLine) / fixed.sqmPerAdditionalLine);
}

function updateLineOptions(maxLines) {
  const previous = Number(el.linesInput.value) || maxLines;
  el.linesInput.replaceChildren();
  if (maxLines === 0) {
    el.linesInput.add(new Option('0 líneas disponibles', '0'));
    return;
  }
  for (let count = 1; count <= maxLines; count += 1) {
    el.linesInput.add(new Option(`${count} ${count === 1 ? 'línea' : 'líneas'}`, String(count)));
  }
  el.linesInput.value = String(Math.min(previous, maxLines));
}

function defaultRentForArea(area) {
  return area * fixed.rentPerSqm;
}

function syncRentField(area) {
  const isOwned = el.propertyType.value === 'owned';
  el.rent.disabled = isOwned;
  if (isOwned) {
    el.rent.value = '$ 0';
  } else if (!rentCustomized) {
    el.rent.value = money(defaultRentForArea(area));
  }
}

function calculate() {
  const area = value('area');
  const hours = value('hours');
  syncRentField(area);
  const maxLines = maxLinesForArea(area);
  updateLineOptions(maxLines);
  const lines = Math.min(value('linesInput'), maxLines);
  const cashierType = el.cashierType.value;
  const setup = lines > 0
    ? fixed.firstLineInvestment + ((lines - 1) * fixed.additionalLineInvestment)
    : 0;
  const automaticCashier = cashierType === 'automatic' ? fixed.automaticCashierInvestment : 0;
  const investment = setup + automaticCashier + value('franchiseFee');
  const rent = value('rent');
  const dailyPerLine = hours * fixed.vehiclesPerLinePerHour;
  const dailyTotal = dailyPerLine * lines;
  const monthlyTotal = dailyTotal * fixed.operatingDaysPerMonth;
  const lineLabel = lines === 1 ? 'línea' : 'líneas';
  out('lines').textContent = `${integer.format(lines)} ${lines === 1 ? 'línea' : 'líneas'}`;
  el.setup.value = `$ ${integer.format(setup)}`;
  out('capacityPerLine').textContent = `${integer.format(dailyTotal)} vehículos/día en todo el punto`;
  out('capacityTotal').textContent = `${integer.format(dailyPerLine)} por línea × ${integer.format(lines)} ${lineLabel} · ${integer.format(monthlyTotal)} al mes`;
  scenarios.forEach((scenario) => renderScenario(scenario, lines, investment, rent, monthlyTotal, cashierType));
}

function formatCopInput(input) {
  const raw = value(input.id);
  input.value = `$ ${integer.format(raw)}`;
}

el.area.addEventListener('input', calculate);
el.hours.addEventListener('input', calculate);
el.linesInput.addEventListener('change', calculate);
el.cashierType.addEventListener('change', calculate);
el.propertyType.addEventListener('change', () => {
  rentCustomized = false;
  calculate();
});
el.rent.addEventListener('input', (event) => {
  rentCustomized = true;
  formatCopInput(event.target);
  calculate();
});
el.franchiseFee.addEventListener('input', (event) => {
  formatCopInput(event.target);
  calculate();
});
document.getElementById('franchiseCalculator').addEventListener('submit', (event) => event.preventDefault());
calculate();
