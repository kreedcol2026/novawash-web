import test from 'node:test';
import assert from 'node:assert/strict';
import { project, csv } from '../partners-model.mjs';
const close = (a,b) => assert.ok(Math.abs(a-b)<.001, `${a} != ${b}`);
test('200 M round, 10 M contribution, 40% investor waterfall', () => {
  const p=project(); close(p.funding,200000000);close(p.weight,.05);close(p.effectiveShare,.02);
  close(p.firstPayment,1102500);close(p.steadyPayment,210000);close(p.firstYearYield,.11025);close(p.steadyYield,.252);
});
test('no payments before month 12 and no duplicate annual payment',()=>{
  const p=project();assert.ok(p.rows.slice(0,11).every(r=>r.payment===0));close(p.rows[11].payment,p.rows[11].accrued);
  close(p.rows[12].payment,p.rows[12].earned);close(p.rows[12].paid,p.firstPayment+p.steadyPayment);assert.ok(p.rows.every(r=>r.pending>=0));
});
test('startup losses offset before any distributable profit',()=>{
  const p=project();close(p.rows[0].operating,-25000000);close(p.rows[2].losses,45000000);assert.ok(p.rows.slice(0,6).every(r=>r.earned===0));close(p.rows[6].eligible,5000000);
});
test('stress does not fabricate earnings or payments and flags missing cash',()=>{const p=project({scenario:'stress'});assert.ok(p.rows.every(r=>r.earned===0&&r.payment===0));assert.ok(p.shortfall>0);});
test('prudent case flags insufficient 50 M working capital',()=>{close(project({scenario:'prudent'}).shortfall,4750000);});
test('more sites require more funding; same investment does not multiply returns',()=>{const a=project(),b=project({sites:5});close(b.funding,a.funding*5);close(b.weight,a.weight/5);close(b.firstPayment,a.firstPayment);});
test('amount proportional, operator + partners exactly distributable',()=>{const p=project({investment:20000000});close(p.firstPayment,project().firstPayment*2);for(const r of p.rows)close(r.partners+r.operator,r.distributable);});
test('full reserve or full provision produces zero payouts',()=>{assert.equal(project({reserve:100}).firstPayment,0);assert.equal(project({provision:100}).firstPayment,0);});
test('invalid numbers, insufficient amount, oversized contribution and scenario fail closed',()=>{for(const c of [{investment:9999999},{investment:Infinity},{investment:200000001},{sites:0},{sites:1.5},{scenario:'<script>'},{reserve:-1},{working:NaN},{investorShare:0}])assert.throws(()=>project(c));});
test('month24 never returns capital automatically',()=>{const p=project();close(p.rows[23].payment,p.steadyPayment);close(p.rows[23].paid,p.firstPayment+12*p.steadyPayment);});
test('CSV has exactly 36 simulated data rows and no markup',()=>{const out=csv(project());assert.equal(out.split('\r\n').length,38);assert.match(out,/NO SON VENTAS NI PAGOS REALES/);assert.ok(!out.includes('<'));});
