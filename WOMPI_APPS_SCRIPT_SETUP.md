# Integración Wompi + NovaWash (Apps Script)

Este proyecto ya quedó preparado en frontend para llamar la acción:
- `createWompiCheckout`

y abrir checkout de Wompi automáticamente.

## 1) Configurar propiedades en Apps Script
En tu proyecto Apps Script:
- **Project Settings** -> **Script properties** -> agrega:

- `WOMPI_PUBLIC_KEY`
- `WOMPI_INTEGRITY_SECRET`
- `WOMPI_PRIVATE_KEY` (para validación/consulta de transacciones)

## 2) Agregar este bloque a `Código.gs`
Pégalo debajo de tus funciones existentes (`getState_`, `saveState_`, etc.) y ajusta tu `doPost` para enrutar acciones nuevas.

```javascript
function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = body.action;

    if (action === 'saveState') {
      if (!body.data || typeof body.data !== 'object') {
        return jsonOut({ ok: false, error: 'Falta data' });
      }
      saveState_(body.data);
      return jsonOut({ ok: true, message: 'Estado guardado' });
    }

    if (action === 'createWompiCheckout') {
      return jsonOut(createWompiCheckout_(body));
    }

    if (action === 'confirmWompiTransaction') {
      return jsonOut(confirmWompiTransaction_(body));
    }

    // Webhook de Wompi (configura Wompi para enviar a .../exec?action=wompiWebhook)
    const queryAction = e && e.parameter ? e.parameter.action : '';
    if (queryAction === 'wompiWebhook') {
      return jsonOut(processWompiWebhook_(body));
    }

    return jsonOut({ ok: false, error: 'Accion no soportada' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function createWompiCheckout_(body) {
  const publicKey = getProp_('WOMPI_PUBLIC_KEY');
  const integritySecret = getProp_('WOMPI_INTEGRITY_SECRET');

  const amount = Math.floor(Number(body.amount) || 0);
  if (amount < 1000) return { ok: false, error: 'Monto inválido' };

  const userId = String(body.userId || '').trim();
  const userEmail = String(body.userEmail || '').trim().toLowerCase();
  if (!userId || !userEmail) return { ok: false, error: 'Faltan datos de cliente' };

  const amountInCents = amount * 100;
  const currency = 'COP';
  const reference = `NW-${userId}-${Date.now()}`;

  const signature = sha256Hex_(`${reference}${amountInCents}${currency}${integritySecret}`);

  const redirectUrl = (body.returnUrl || 'https://novawash.com.co/dashboard.html').toString();

  const checkoutUrl =
    'https://checkout.wompi.co/p/?' +
    [
      ['public-key', publicKey],
      ['currency', currency],
      ['amount-in-cents', String(amountInCents)],
      ['reference', reference],
      ['redirect-url', redirectUrl],
      ['signature:integrity', signature],
      ['customer-data:email', userEmail],
    ]
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

  const state = getState_();
  if (!Array.isArray(state.auditLogs)) state.auditLogs = [];
  state.auditLogs.push({
    at: new Date().toISOString(),
    actor: 'wompi',
    targetEmail: userEmail,
    action: 'wompi_checkout_created',
    detail: `Checkout creado para ${reference}`,
    amount,
    reference,
  });
  saveState_(state);

  return { ok: true, checkoutUrl, reference };
}

function confirmWompiTransaction_(body) {
  const txId = String(body.transactionId || '').trim();
  if (!txId) return { ok: false, error: 'Falta transactionId' };

  const privateKey = getProp_('WOMPI_PRIVATE_KEY');
  const res = UrlFetchApp.fetch(`https://production.wompi.co/v1/transactions/${encodeURIComponent(txId)}`, {
    method: 'get',
    headers: { Authorization: `Bearer ${privateKey}` },
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    return { ok: false, error: `Wompi API error ${res.getResponseCode()}` };
  }

  const json = JSON.parse(res.getContentText() || '{}');
  const tx = json.data;
  if (!tx) return { ok: false, error: 'Transacción inválida' };

  return applyApprovedWompiTx_(tx);
}

function processWompiWebhook_(payload) {
  const tx = payload && payload.data && payload.data.transaction ? payload.data.transaction : null;
  if (!tx) return { ok: false, error: 'Webhook sin transacción' };
  return applyApprovedWompiTx_(tx);
}

function applyApprovedWompiTx_(tx) {
  if (String(tx.status || '').toUpperCase() !== 'APPROVED') {
    return { ok: true, message: 'Transacción no aprobada aún' };
  }

  const txId = String(tx.id || tx.transaction_id || '');
  const reference = String(tx.reference || '');
  const amount = Math.floor((Number(tx.amount_in_cents) || 0) / 100);

  if (!reference || amount <= 0) return { ok: false, error: 'Datos de transacción inválidos' };

  const userId = reference.startsWith('NW-') ? reference.split('-').slice(1, 3).join('-') : '';
  if (!userId) return { ok: false, error: 'No se pudo resolver userId desde reference' };

  const state = getState_();
  if (!Array.isArray(state.users)) state.users = [];
  if (!Array.isArray(state.auditLogs)) state.auditLogs = [];

  const duplicate = state.auditLogs.some((l) => l.action === 'wompi_approved' && String(l.transactionId || '') === txId);
  if (duplicate) return { ok: true, message: 'Transacción ya aplicada' };

  const user = state.users.find((u) => String(u.userId || '') === userId);
  if (!user) return { ok: false, error: `Usuario no encontrado: ${userId}` };

  user.wallet = Math.max(0, Number(user.wallet) || 0) + amount;
  if (!user.plan) user.plan = { mode: 'basic_single', washesRemaining: 0, cycleStart: null, cycleEnd: null, usedPlates: [] };
  if (!user.stats) user.stats = { washesDone: 0, loyaltyProgress: 0 };
  user.paymentMethod = 'Wompi';

  const mode = user.plan.mode === 'premium_monthly' ? 'premium_monthly' : 'basic_single';
  const price = mode === 'premium_monthly' ? 25000 : 35000;
  user.plan.washesRemaining = Math.max(0, Math.floor((Number(user.wallet) || 0) / price));

  if (!Array.isArray(user.history)) user.history = [];
  user.history.push({
    date: new Date().toISOString(),
    type: 'pago',
    detail: `Recarga Wompi aprobada por $${amount.toLocaleString('es-CO')}.`,
  });

  state.auditLogs.push({
    at: new Date().toISOString(),
    actor: 'wompi',
    targetEmail: user.email || '-',
    action: 'wompi_approved',
    detail: `Recarga automática aplicada por Wompi.`,
    amount,
    reference,
    transactionId: txId,
  });

  state.stateUpdatedAt = Date.now();
  saveState_(state);
  return { ok: true, message: 'Recarga aplicada', amount, userId };
}

function getProp_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error(`Falta propiedad: ${key}`);
  return value;
}

function sha256Hex_(text) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return digest.map((b) => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
```

## 3) En Wompi configura webhook
URL sugerida:

`https://script.google.com/macros/s/TU_DEPLOY_ID/exec?action=wompiWebhook`

Eventos: `transaction.updated`

## 4) Redeploy Apps Script
- Deploy -> Manage deployments -> Edit -> New version -> Deploy

## 5) Prueba
- En portal cliente, botón **Recargar con Wompi**.
- Completa pago.
- El saldo debe subir automáticamente y verse en dashboard/backoffice.
