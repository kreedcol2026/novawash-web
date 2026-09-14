# NovaWash Partners — versión informativa, septiembre 2026

## Alcance publicado

Página `partners.html`, simulador de 36 meses, exportación CSV y panel público **demostrativo** `socios.html`. No hay emisión de participaciones, recepción de capital, contratos, saldos reales, datos bancarios ni cuenta privada. Los parámetros de URL son públicos e hipotéticos; jamás transportar datos financieros personales por esta vía.

## Datos indicados por dirección

- Montaje aproximado por unidad: COP 150.000.000.
- Aporte mínimo: COP 10.000.000.
- Propuesta: 40% de utilidades para el grupo inversionista, ponderado por aporte; 60% NovaWash.
- Utilidad estimada indicada: COP 15–25 millones por lavadero. Se interpretó provisionalmente como mensual después de costos operativos, antes de otras salidas. No es resultado histórico auditado.
- Primera distribución al mes 12; posteriores mensuales; permanencia mínima 24 meses; eventual cesión conforme al contrato.

## Hipótesis adicionales, NO decisiones contractuales

COP 50 M de capital de trabajo por unidad: ronda total COP 200 M. El costo de montaje no es una valoración accionaria. Los inversionistas financian la meta completa en este ejemplo; no se presume un aporte en efectivo de NovaWash. Sus aportes de marca/gestión, derechos y contraprestaciones requieren negociación explícita.

Provisión del 30% para obligaciones adicionales: hipótesis presupuestaria, NO tasa tributaria. Reserva del 25% sobre el remanente. Gastos reales, impuestos, servicio de deuda y costos partner deben sustituir estos porcentajes. El costo de financiamiento puede ser cero o mayor según la estructura efectiva.

Costos mensuales hipotéticos COP 80 M. Ventas maduras: estrés 75 M; prudente 95 M; base 100 M; favorable 105 M. Arranque de ventas 55/65/75/85/90/95/100% y costos completos desde mes 1. No se presupone crecimiento perpetuo, reinversión individual, valorización o nuevas rondas gratuitas. Todas las unidades del escenario abren juntas y comparten parámetros.

## Fórmula

Meta = (montaje + capital de trabajo) × unidades de la ronda.
Peso del aporte = aporte / meta totalmente financiada.
Resultado = ventas − costos; pérdidas acumuladas se compensan antes de repartir.
Distribuible = resultado elegible × (1 − provisión) × (1 − reserva).
Grupo partner = distribuible × porcentaje de reparto.
Ingreso individual = grupo partner × peso del aporte.

Ejemplo base COP 10 M / COP 200 M = 5% del grupo. 5% × 40% = 2% de lo distribuible total. Primer año hipotético COP 1.102.500; mes maduro COP 210.000; simple anual maduro 25,2%, no garantizado. Estos importes NO incluyen devolución del aporte ni retenciones personales. No representan propiedad del 2% de toda la empresa.

Primer pago suma meses 1–12. Mes 13 paga solo mes 13. Mes 24 no devuelve capital automáticamente. El presupuesto de caja descuenta obligaciones de reparto desde su devengo aunque el pago sea posterior: lectura conservadora de la liquidez disponible. Se alerta si el capital de trabajo es insuficiente; no se inventa financiación de rescate. Un déficit vuelve el escenario operativamente condicionado, no financiado.

## Límite de lanzamiento real

1. Abogado y contador definen entidad receptora, instrumento, derechos económicos/políticos, rondas, cesión, valoración, permanencia, pérdidas, dilución, conflicto de interés y calendario de distribuciones legalmente posible. No asumir que la web puede captar recursos por llamarlos aportes.
2. Validar presupuesto de cada unidad, permisos, cronograma y fuente de rendimientos. Documentar aportes de NovaWash y toda remuneración para evitar duplicar gastos de gestión.
3. Si aplica financiación colaborativa por valores, utilizar la estructura/plataforma autorizada correspondiente. Referencia oficial consultada: https://www.superfinanciera.gov.co/publicaciones/10115001/superfinanciera-presenta-guias-practicas-sobre-financiacion-colaborativa-en-colombia/
4. Implementar backend separado con autenticación y autorización del lado servidor. NO reutilizar el estado global del cliente ni credenciales embebidas en `script.js` para inversiones. El navegador no puede decidir si alguien es socio o administrador.
5. Registro de aportes conciliados, cuotas y titularidad, cierres por unidad, pérdidas, provisiones, reservas, aprobaciones y distribuciones. Cierres versionados e inmutables tras aprobación, correcciones con asiento y auditoría. Los pagos tienen identificador único y conciliación para impedir dobles envíos.
6. Privacidad, conocimiento del cliente cuando aplique, contratos firmados y controles de acceso antes de cargar información privada.

## Contrato de datos sugerido para futura integración

- Investor: id servidor, identidad autenticada, estado de verificaciones; no listado público.
- Round: id, unidades incluidas, meta, presupuesto, estado, contrato versionado.
- Contribution: investorId, roundId, monto COP, fecha efectiva, soporte conciliado, derechos asignados.
- SiteClosing: siteId, periodo, ventas, costos, obligaciones, pérdidas, reservas, estado de aprobación, versión y aprobador.
- Allocation: contributionId, closingId, base ponderada, monto bruto, retención, neto. Inmutabilidad/idempotencia por cierre y aporte.
- Distribution: allocationIds, fecha elegible, aprobación, fecha de pago real, referencia bancaria y estado; nunca marcar pagado antes de conciliación.
- TransferRequest: titular, contrato, derechos, fecha, comprador validado, autorizaciones; solicitar no significa ejecutar.

El servidor entrega al socio únicamente su cartera y métricas agregadas autorizadas. Sheets puede ser una fuente contable interna si se valida y se protege detrás del servidor; no exponer una hoja completa ni usar el navegador como fuente de verdad.

## Verificación

`node --test tests/partners-model.test.mjs` valida fórmula, prorrata, arranque, pérdidas, caja insuficiente, límites, reparto, periodicidad y CSV. El panel se alimenta exclusivamente del mismo modelo puro; no consulta el endpoint de clientes ni modifica datos existentes.
