// Modelo ilustrativo. No es un registro contable ni una valoración de acciones.
export const DEFAULTS = Object.freeze({ investment: 10000000, sites: 1, setup: 150000000, working: 50000000, investorShare: 40, provision: 30, reserve: 25, scenario: 'base' });
export const SCENARIOS = Object.freeze({ stress: { label: 'Estrés', profit: -5000000 }, prudent: { label: 'Prudente', profit: 15000000 }, base: { label: 'Base', profit: 20000000 }, favorable: { label: 'Favorable', profit: 25000000 } });
export const RAMP = Object.freeze([.55, .65, .75, .85, .9, .95, 1, 1, 1, 1, 1, 1]);
export function validate(input) {
  const c = { ...DEFAULTS, ...input };
  for (const key of ['investment','sites','setup','working','investorShare','provision','reserve']) if (!Number.isFinite(c[key])) throw new Error('Completa los valores con números válidos.');
  if (!SCENARIOS[c.scenario]) throw new Error('Selecciona un escenario válido.');
  if (c.investment < 10000000) throw new Error('El aporte mínimo del modelo es $10.000.000.');
  if (!Number.isInteger(c.sites) || c.sites < 1 || c.sites > 10) throw new Error('Elige entre 1 y 10 lavaderos.');
  if (c.setup < 10000000 || c.setup > 2000000000 || c.working < 0 || c.working > 2000000000) throw new Error('Revisa el presupuesto de montaje y capital de trabajo.');
  if (c.investorShare <= 0 || c.investorShare > 100 || c.provision < 0 || c.provision > 100 || c.reserve < 0 || c.reserve > 100) throw new Error('Los porcentajes deben estar entre 0 y 100; el reparto debe ser mayor a cero.');
  if (c.investment > (c.setup + c.working) * c.sites) throw new Error('El aporte no puede superar la meta total de la ronda del escenario.');
  return c;
}
export function project(input = {}) {
  const c = validate(input);
  const funding = (c.setup + c.working) * c.sites;
  const weight = c.investment / funding;
  const costsPerSite = 80000000; // Hipótesis ajustada a una operación madura; no costos históricos.
  const revenuePerSite = costsPerSite + SCENARIOS[c.scenario].profit;
  let losses = 0, accrued = 0, paid = 0, operatingCash = c.working * c.sites, minCash = operatingCash;
  const rows = Array.from({ length: 36 }, (_, i) => {
    const month = i + 1;
    const ramp = RAMP[i] ?? 1;
    const sales = revenuePerSite * ramp * c.sites;
    const costs = costsPerSite * c.sites;
    const operating = sales - costs;
    const eligible = Math.max(0, operating - losses);
    losses = Math.max(0, losses - operating);
    const provisions = eligible * c.provision / 100;
    const reserve = (eligible - provisions) * c.reserve / 100;
    const distributable = Math.max(0, eligible - provisions - reserve);
    const partners = distributable * c.investorShare / 100;
    const operator = distributable - partners;
    const earned = partners * weight;
    accrued += earned;
    // La primera distribución reúne meses 1–12; no se duplica al mes 13.
    const payment = month === 12 ? accrued : month > 12 ? earned : 0;
    paid += payment;
    // Caja operativa conservadora: aparta desde el devengo todas las obligaciones de reparto.
    operatingCash += operating - provisions - distributable;
    minCash = Math.min(minCash, operatingCash);
    return { month, ramp, sales, costs, operating, losses, eligible, provisions, reserve, distributable, partners, operator, earned, accrued, payment, paid, pending: accrued - paid, operatingCash };
  });
  return { config: c, funding, weight, effectiveShare: weight * c.investorShare / 100, rows, firstPayment: rows[11].payment, steadyPayment: rows[12].payment, firstYearYield: rows[11].payment / c.investment, steadyYield: rows[12].payment * 12 / c.investment, shortfall: Math.max(0, -minCash) };
}
export function csv(model) {
  const keys = ['month','sales','costs','operating','losses','provisions','reserve','distributable','partners','operator','earned','payment','paid','pending'];
  const headers = ['Mes','Ventas simuladas COP','Costos simulados COP','Resultado operativo COP','Perdidas pendientes COP','Provisiones COP','Reserva COP','Distribuible COP','Grupo partners COP','NovaWash COP','Utilidad del aporte COP','Pago hipotetico COP','Pagos acumulados COP','Pendiente hipotetico COP'];
  return '\uFEFFSIMULACION - NO SON VENTAS NI PAGOS REALES\r\n' + headers.join(';') + '\r\n' + model.rows.map(r => keys.map(k => Math.round(r[k])).join(';')).join('\r\n');
}
