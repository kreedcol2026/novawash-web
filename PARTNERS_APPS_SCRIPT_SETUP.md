# NovaWash Partners: acceso privado desde Google Sheets

El portal `partners-portal.html` consulta únicamente dos acciones del Apps Script ya conectado al sitio:

- `partnerLogin`: valida correo, contraseña y estado del partner.
- `getPartnerPortal`: devuelve solo la información del partner asociada al token temporal de su sesión.

No agregues contraseñas ni cifras de socios al JavaScript público. El control se hace en Apps Script.

## Hojas requeridas

En el mismo archivo de Google Sheets que usa NovaWash, crea estas pestañas con estos encabezados exactos en la fila 1.

### `Partners`

| Email | Nombre | PasswordHash | Estado | CapitalInvertido | RendimientoAcumulado | RendimientoEA | ProximoCorte | Proyecto | FechaIngreso | EstadoCapital | NotaCorte |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- |

Usa `ACTIVO` en Estado para autorizar el ingreso. La contraseña nunca se guarda en texto plano: usa `partnerHash_('contraseña-definida-con-el-socio')` desde Apps Script y pega el resultado en `PasswordHash`.

### `Movimientos Partners`

| Email | Fecha | Concepto | Proyecto | Monto | Estado |
| --- | --- | --- | --- | ---: | --- |

### `Rendimiento Partners`

| Email | Periodo | Acumulado |
| --- | --- | ---: |

Cada fila de rendimiento representa un corte de la evolución acumulada del partner.

## Código para añadir al Apps Script actual

Pega estas funciones en el proyecto de Apps Script ya desplegado. En el `doPost(e)` existente, enruta `partnerLogin` a `partnerLogin_` y `getPartnerPortal` a `getPartnerPortal_`, antes de devolver el error de acción desconocida.

```javascript
const PARTNER_SESSION_PREFIX = 'novaWashPartnerSession:';
const PARTNER_SESSION_HOURS = 8;

function partnerHash_(plainText) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(plainText), Utilities.Charset.UTF_8);
  return bytes.map(function(byte) { return ('0' + (byte & 0xff).toString(16)).slice(-2); }).join('');
}

function partnerRows_(sheetName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) throw new Error('No existe la hoja ' + sheetName + '.');
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(function(header) { return String(header).trim(); });
  return values.filter(function(row) { return row.some(function(value) { return value !== ''; }); }).map(function(row) {
    return headers.reduce(function(record, header, index) { record[header] = row[index]; return record; }, {});
  });
}

function partnerValue_(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function partnerLogin_(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const partner = partnerRows_('Partners').find(function(row) {
    return String(row.Email || '').trim().toLowerCase() === email && String(row.Estado || '').toUpperCase() === 'ACTIVO';
  });
  if (!partner || !password || partnerHash_(password) !== String(partner.PasswordHash || '')) {
    return { ok: false, error: 'Correo, contraseña o autorización inválidos.' };
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty(PARTNER_SESSION_PREFIX + token, JSON.stringify({
    email: email,
    expiresAt: Date.now() + PARTNER_SESSION_HOURS * 60 * 60 * 1000
  }));
  return { ok: true, token: token };
}

function partnerSession_(token) {
  const key = PARTNER_SESSION_PREFIX + String(token || '');
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return null;
  const session = JSON.parse(raw);
  if (!session.expiresAt || session.expiresAt < Date.now()) {
    PropertiesService.getScriptProperties().deleteProperty(key);
    return null;
  }
  return session;
}

function getPartnerPortal_(body) {
  const session = partnerSession_(body.token);
  if (!session) return { ok: false, error: 'Tu sesión expiró. Ingresa de nuevo.' };
  const partner = partnerRows_('Partners').find(function(row) {
    return String(row.Email || '').trim().toLowerCase() === session.email && String(row.Estado || '').toUpperCase() === 'ACTIVO';
  });
  if (!partner) return { ok: false, error: 'No tienes acceso autorizado a este panel.' };
  const movements = partnerRows_('Movimientos Partners').filter(function(row) {
    return String(row.Email || '').trim().toLowerCase() === session.email;
  }).map(function(row) {
    return { date: partnerValue_(row.Fecha), concept: row.Concepto, project: row.Proyecto, amount: Number(row.Monto) || 0, status: row.Estado };
  }).sort(function(a,b) { return new Date(b.date) - new Date(a.date); });
  const growth = partnerRows_('Rendimiento Partners').filter(function(row) {
    return String(row.Email || '').trim().toLowerCase() === session.email;
  }).map(function(row) { return { label: String(row.Periodo || ''), value: Number(row.Acumulado) || 0 }; });
  return { ok: true, partner: { name: partner.Nombre, status: partner.Estado, summary: {
    capitalInvested: Number(partner.CapitalInvertido) || 0,
    accumulatedReturn: Number(partner.RendimientoAcumulado) || 0,
    annualReturn: partner.RendimientoEA,
    nextCut: partnerValue_(partner.ProximoCorte),
    nextCutNote: partner.NotaCorte,
    project: partner.Proyecto,
    memberSince: partnerValue_(partner.FechaIngreso),
    capitalStatus: partner.EstadoCapital
  }, movements: movements, growth: growth } };
}
```

En el enrutador actual, la parte relevante debe quedar así:

```javascript
if (body.action === 'partnerLogin') return json_(partnerLogin_(body));
if (body.action === 'getPartnerPortal') return json_(getPartnerPortal_(body));
```

Después, despliega una nueva versión del Web App y conserva la misma URL si el despliegue se actualiza en lugar de crear uno nuevo. Prueba primero con un partner autorizado y datos de prueba.
