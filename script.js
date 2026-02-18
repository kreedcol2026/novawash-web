const APP_KEY = 'novaWashAppV3';
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxlF0G6qgbr4We9HK5EthJ0slWw90JYZtbjJk9j65KIDV88SmMoI4_nYmTLKVLVRHj6Mg/exec';
const PRICES = {
  basicSingle: 35000,
  premiumPerWash: 25000,
  premiumMonthlyFee: 50000,
  cashTopUpDefault: 50000,
};
const BO_SESSION_KEY = 'novaWashBackofficeSession';
const BO_USER = 'personal';
const BO_PASS = 'NovaWashAdmin2026';
let appDataCache = null;
let remoteStateLoaded = false;
let hasUnsyncedLocalChanges = false;
let remoteSaveInFlight = false;
let pendingRemoteState = null;

const header = document.querySelector('.site-header');
const revealEls = document.querySelectorAll('.reveal');

function handleHeaderState() {
  if (!header) return;
  header.classList.toggle('scrolled', window.scrollY > 8);
}

if (header) {
  window.addEventListener('scroll', handleHeaderState, { passive: true });
  handleHeaderState();
}

function initMobileMenu() {
  if (!header) return;
  const toggle = header.querySelector('.menu-toggle');
  const nav = header.querySelector('.main-nav');
  if (!toggle || !nav) return;

  function closeMenu() {
    header.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', () => {
    const willOpen = !header.classList.contains('menu-open');
    header.classList.toggle('menu-open', willOpen);
    toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('click', (event) => {
    if (!header.classList.contains('menu-open')) return;
    if (header.contains(event.target)) return;
    closeMenu();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      closeMenu();
    }
  });
}

initMobileMenu();

if (revealEls.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
  );
  revealEls.forEach((el) => observer.observe(el));
}

function buildDefaultData() {
  return { users: [], currentUserEmail: null, queueNumber: 0, auditLogs: [], stateUpdatedAt: 0 };
}

function normalizeAppState(parsed) {
  const source = parsed || {};
  const stateUpdatedAt = Number(source.stateUpdatedAt) || 0;
  return {
    users: Array.isArray(source.users) ? source.users : [],
    currentUserEmail: source.currentUserEmail || null,
    queueNumber: Number.isFinite(source.queueNumber) ? source.queueNumber : 0,
    auditLogs: Array.isArray(source.auditLogs) ? source.auditLogs : [],
    stateUpdatedAt,
  };
}

function readLocalState() {
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (!raw) return buildDefaultData();
    return normalizeAppState(JSON.parse(raw));
  } catch {
    return buildDefaultData();
  }
}

function writeLocalState(data) {
  localStorage.setItem(APP_KEY, JSON.stringify(normalizeAppState(data)));
}

function fetchRemoteStateSync() {
  try {
    const sep = APPS_SCRIPT_URL.includes('?') ? '&' : '?';
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${APPS_SCRIPT_URL}${sep}action=getState`, false);
    xhr.send(null);
    if (xhr.status < 200 || xhr.status >= 300) return null;
    const payload = JSON.parse(xhr.responseText || '{}');
    if (!payload || !payload.ok || !payload.data) return null;
    return normalizeAppState(payload.data);
  } catch {
    return null;
  }
}

async function fetchRemoteStateAsync() {
  try {
    const sep = APPS_SCRIPT_URL.includes('?') ? '&' : '?';
    const res = await fetch(`${APPS_SCRIPT_URL}${sep}action=getState`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const payload = await res.json();
    if (!payload || !payload.ok || !payload.data) return null;
    return normalizeAppState(payload.data);
  } catch {
    return null;
  }
}

async function flushPendingRemoteState() {
  if (remoteSaveInFlight || !pendingRemoteState) return;
  remoteSaveInFlight = true;

  const payload = pendingRemoteState;
  pendingRemoteState = null;

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'saveState',
        data: normalizeAppState(payload),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    let ok = true;
    try {
      const body = await response.json();
      ok = Boolean(body?.ok);
    } catch {
      ok = true;
    }
    if (!ok) throw new Error('saveState rejected');

    const local = getData();
    if ((Number(local.stateUpdatedAt) || 0) <= (Number(payload.stateUpdatedAt) || 0)) {
      hasUnsyncedLocalChanges = false;
    }
  } catch {
    pendingRemoteState = payload;
    setTimeout(() => {
      flushPendingRemoteState();
    }, 2500);
  } finally {
    remoteSaveInFlight = false;
    if (pendingRemoteState) {
      flushPendingRemoteState();
    }
  }
}

function pushRemoteState(data) {
  pendingRemoteState = normalizeAppState(data);
  flushPendingRemoteState();
}

function getData() {
  if (appDataCache) return appDataCache;
  appDataCache = readLocalState();
  if (!remoteStateLoaded) {
    const remote = fetchRemoteStateSync();
    if (remote) {
      appDataCache = remote;
      writeLocalState(remote);
    }
    remoteStateLoaded = true;
  }
  return appDataCache;
}

function saveData(data) {
  appDataCache = normalizeAppState(data);
  appDataCache.stateUpdatedAt = Date.now();
  hasUnsyncedLocalChanges = true;
  writeLocalState(appDataCache);
  pushRemoteState(appDataCache);
}

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

function playScanBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc2.type = 'square';
    osc.frequency.value = 1280;
    osc2.frequency.value = 960;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.65, ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc2.start();
    osc.stop(ctx.currentTime + 0.25);
    osc2.stop(ctx.currentTime + 0.25);
    osc.onended = () => {
      ctx.close();
    };
  } catch {
    // No-op
  }
}

function normalizePlate(text) {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function nowISO() {
  return new Date().toISOString();
}

function buildUserId(seed) {
  const text = String(seed || 'nova-user');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return `NW-${Math.abs(hash).toString().slice(0, 8).padStart(6, '0')}`;
}

function generateQrToken() {
  return `Q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

function getUserQrPayload(user) {
  return `NOVAWASH-USER:${user.qrToken}`;
}

function getQrImageUrl(payload, size = 140) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}

function oneMonthFromNowISO() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

function findUserByEmail(data, email) {
  return data.users.find((u) => u.email === email) || null;
}

function findUserByQrToken(data, token) {
  return data.users.find((u) => String(u.qrToken || '').toUpperCase() === String(token || '').toUpperCase()) || null;
}

function normalizeUser(user) {
  const normalized = user || {};
  const plan = normalized.plan || {};
  let mode = plan.mode || 'basic_single';

  // Migracion de versiones anteriores.
  if (mode === 'basic_monthly') mode = 'premium_monthly';
  if (mode === 'premium') mode = 'basic_single';

  return {
    ...normalized,
    userId: normalized.userId || buildUserId(`${normalized.email || ''}-${normalized.createdAt || ''}`),
    qrToken: normalized.qrToken || generateQrToken(),
    wallet: Number.isFinite(normalized.wallet) ? normalized.wallet : 0,
    paymentMethod: normalized.paymentMethod || 'Efectivo en punto',
    cedula: normalized.cedula || '',
    vehicleModel: normalized.vehicleModel || '',
    phone: normalized.phone || '',
    plate: normalized.plate || '',
    stripeLinked: Boolean(normalized.stripeLinked),
    history: Array.isArray(normalized.history) ? normalized.history : [],
    stats: {
      washesDone: Number.isFinite(normalized?.stats?.washesDone) ? normalized.stats.washesDone : 0,
    },
    plan: {
      mode,
      washesRemaining: Number.isFinite(plan.washesRemaining) ? plan.washesRemaining : 0,
      cycleStart: plan.cycleStart || null,
      cycleEnd: plan.cycleEnd || null,
      usedPlates: Array.isArray(plan.usedPlates) ? plan.usedPlates : [],
    },
  };
}

function getWashUnitPriceByPlan(user) {
  return user.plan.mode === 'premium_monthly' ? PRICES.premiumPerWash : PRICES.basicSingle;
}

function syncAvailableWashes(user) {
  const price = getWashUnitPriceByPlan(user);
  user.plan.washesRemaining = Math.max(0, Math.floor((Number(user.wallet) || 0) / price));
  return user.plan.washesRemaining;
}

function getCurrentUser(data) {
  if (!data.currentUserEmail) return null;
  const user = findUserByEmail(data, data.currentUserEmail);
  if (!user) return null;
  Object.assign(user, normalizeUser(user));
  return user;
}

function setResult(el, text, type = '') {
  if (!el) return;
  el.textContent = text;
  el.className = el.className.split(' ')[0];
  if (type) el.classList.add(type);
}

function applyMonthlyReset(user, data = null, actor = 'sistema') {
  if (!user || user.plan.mode !== 'premium_monthly') return false;
  if (!user.plan.cycleEnd) return false;
  const cycleEndDate = new Date(user.plan.cycleEnd);
  if (Number.isNaN(cycleEndDate.getTime())) return false;
  if (Date.now() < cycleEndDate.getTime()) return false;

  user.wallet = PRICES.premiumMonthlyFee;
  user.plan.usedPlates = [];
  user.plan.cycleStart = nowISO();
  user.plan.cycleEnd = oneMonthFromNowISO();
  syncAvailableWashes(user);
  addHistory(
    user,
    `Renovación automática Premium aplicada por ${formatCOP(PRICES.premiumMonthlyFee)}. Se reinicia saldo y cupos.`,
    'renovacion'
  );
  if (data) {
    addAuditEntry(
      data,
      actor,
      user.email,
      'subscription_renewal',
      `Renovación premium aplicada. Nuevo saldo ${formatCOP(PRICES.premiumMonthlyFee)} y 2 lavadas disponibles.`,
      { amount: PRICES.premiumMonthlyFee }
    );
  }
  return true;
}

function getPlanDescriptor(user) {
  if (user.plan.mode === 'premium_monthly') {
    return {
      name: 'Plan Premium',
      badgeClass: 'sub-premium',
      status: `Descuento activo por lavada: ${formatCOP(PRICES.premiumPerWash)}.`,
    };
  }

  return {
    name: 'Plan Básico',
    badgeClass: 'sub-basic',
    status: `Cobro por lavada: ${formatCOP(PRICES.basicSingle)}.`,
  };
}

function createUser({ name, email, password }) {
  return {
    userId: buildUserId(`${email}-${Date.now()}`),
    qrToken: generateQrToken(),
    name,
    email,
    password,
    cedula: '',
    vehicleModel: '',
    phone: '',
    plate: '',
    wallet: 0,
    paymentMethod: 'Efectivo en punto',
    stripeLinked: false,
    stats: {
      washesDone: 0,
    },
    plan: {
      mode: 'basic_single',
      washesRemaining: 0,
      cycleStart: null,
      cycleEnd: null,
      usedPlates: [],
    },
    history: [],
    createdAt: nowISO(),
  };
}

function addHistory(user, detail, type = 'evento') {
  user.history.push({
    date: nowISO(),
    type,
    detail,
  });
}

function formatShortDate(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-CO');
}

function parseQrPayload(rawValue) {
  const value = String(rawValue || '').trim();
  if (value.toUpperCase().startsWith('NOVAWASH-USER:')) {
    const token = value.split(':')[1]?.trim().toUpperCase();
    return token ? { type: 'user_token', value: token } : null;
  }
  if (value.toUpperCase().startsWith('NOVAWASH-ID:')) {
    const userId = value.split(':')[1]?.trim().toUpperCase();
    return userId ? { type: 'user_id', value: userId } : null;
  }
  if (value.toUpperCase().startsWith('NW-')) {
    return { type: 'user_id', value: value.toUpperCase() };
  }
  const prefixed = value.toUpperCase().startsWith('NOVAWASH:') ? value.split(':')[1] : value;
  const plate = normalizePlate(prefixed);
  return plate.length >= 5 ? { type: 'plate', value: plate } : null;
}

function addAuditEntry(data, actor, targetEmail, action, detail, meta = {}) {
  if (!Array.isArray(data.auditLogs)) data.auditLogs = [];
  data.auditLogs.push({
    at: nowISO(),
    actor: actor || 'sistema',
    targetEmail: targetEmail || '-',
    action,
    detail,
    ...meta,
  });
}

function applyRechargeToUser(user, amount) {
  const before = Number(user.plan?.washesRemaining) || 0;
  user.wallet += amount;
  if (user.plan.mode === 'premium_monthly' && !user.plan.cycleEnd) {
    user.plan.cycleStart = nowISO();
    user.plan.cycleEnd = oneMonthFromNowISO();
  }
  const nowAvailable = syncAvailableWashes(user);
  return Math.max(0, nowAvailable - before);
}

function consumeWashByPlan(user, plate) {
  applyMonthlyReset(user);
  const charge = getWashUnitPriceByPlan(user);
  if (user.wallet < charge) {
    return { ok: false, message: `Saldo insuficiente. Se requieren ${formatCOP(charge)}.` };
  }

  user.wallet -= charge;
  syncAvailableWashes(user);
  user.stats.washesDone += 1;
  user.plate = plate;
  addHistory(
    user,
    `QR ${plate}: lavada cobrada por ${formatCOP(charge)} (${user.plan.mode === 'premium_monthly' ? 'Premium' : 'Básico'}).`,
    'lavada'
  );
  return { ok: true, message: `Lavada QR registrada para ${plate}. Descuento aplicado: ${formatCOP(charge)}.` };
}

function initLandingPage() {
  const arrivalForm = document.querySelector('#arrivalForm');
  const arrivalResult = document.querySelector('#arrivalResult');
  const signupForm = document.querySelector('#signupForm');
  const loginForm = document.querySelector('#loginForm');
  const authMessage = document.querySelector('#authMessage');

  if (arrivalForm) {
    arrivalForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const fd = new FormData(arrivalForm);
      const plate = normalizePlate(String(fd.get('arrivalPlate') || ''));
      const service = String(fd.get('arrivalType') || '');
      if (!plate || plate.length < 5 || !service) {
        setResult(arrivalResult, 'Ingresa una placa válida y tipo de servicio.', 'error');
        return;
      }

      const data = getData();
      data.queueNumber += 1;
      saveData(data);
      const eta = 8 + ((data.queueNumber % 3) * 2);
      setResult(arrivalResult, `Turno #${data.queueNumber} confirmado para ${plate}. Tiempo estimado: ${eta} minutos.`, 'success');
      arrivalForm.reset();
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const fd = new FormData(signupForm);
      const name = String(fd.get('name') || '').trim();
      const email = String(fd.get('email') || '').trim().toLowerCase();
      const password = String(fd.get('password') || '').trim();
      const phone = String(fd.get('phone') || '').trim();
      const cedula = String(fd.get('cedula') || '').trim();
      const plate = normalizePlate(String(fd.get('plate') || '').trim());

      if (!name || !email || password.length < 6) {
        setResult(authMessage, 'Datos incompletos o contraseña corta.', 'error');
        return;
      }

      const data = getData();
      if (findUserByEmail(data, email)) {
        setResult(authMessage, 'Ese correo ya existe.', 'error');
        return;
      }

      const user = createUser({ name, email, password });
      user.cedula = cedula;
      user.phone = phone;
      user.plate = plate;
      data.users.push(user);
      data.currentUserEmail = email;
      saveData(data);
      setResult(authMessage, 'Cuenta creada. Redirigiendo al panel...', 'success');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 500);
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const fd = new FormData(loginForm);
      const email = String(fd.get('email') || '').trim().toLowerCase();
      const password = String(fd.get('password') || '').trim();

      const data = getData();
      const user = data.users.find((u) => u.email === email && u.password === password);
      if (!user) {
        setResult(authMessage, 'Correo o contraseña inválidos.', 'error');
        return;
      }

      data.currentUserEmail = user.email;
      saveData(data);
      setResult(authMessage, 'Sesión iniciada. Redirigiendo...', 'success');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 350);
    });
  }
}

function initDashboardPage() {
  const sessionGuard = document.querySelector('#sessionGuard');
  const dashboard = document.querySelector('#dashboard');
  if (!dashboard) return;

  const welcomeUser = document.querySelector('#welcomeUser');
  const subscriptionType = document.querySelector('#subscriptionType');
  const subscriptionBadge = document.querySelector('#subscriptionBadge');
  const subscriptionStatus = document.querySelector('#subscriptionStatus');
  const subscriptionBenefits = document.querySelector('#subscriptionBenefits');
  const subscriptionWashesLeft = document.querySelector('#subscriptionWashesLeft');
  const subscriptionBalance = document.querySelector('#subscriptionBalance');
  const subscriptionCycleStart = document.querySelector('#subscriptionCycleStart');
  const subscriptionCycleEnd = document.querySelector('#subscriptionCycleEnd');
  const walletStatus = document.querySelector('#walletStatus');
  const paymentStatus = document.querySelector('#paymentStatus');
  const profileNameInput = document.querySelector('#profileNameInput');
  const profileCedulaInput = document.querySelector('#profileCedulaInput');
  const profileEmailInput = document.querySelector('#profileEmailInput');
  const profilePhoneInput = document.querySelector('#profilePhoneInput');
  const profilePlateInput = document.querySelector('#profilePlateInput');
  const profileVehicleModelInput = document.querySelector('#profileVehicleModelInput');
  const profileWashesDone = document.querySelector('#profileWashesDone');
  const profileEditBtn = document.querySelector('#profileEditBtn');
  const profileSaveBtn = document.querySelector('#profileSaveBtn');
  const profileMessage = document.querySelector('#profileMessage');
  const userQrImage = document.querySelector('#userQrImage');
  const userQrCode = document.querySelector('#userQrCode');
  const historyList = document.querySelector('#historyList');
  const washMessage = document.querySelector('#washMessage');

  const logoutBtn = document.querySelector('#logoutBtn');
  const setPremiumMonthlyBtn = document.querySelector('#setPremiumMonthlyBtn');
  const cancelPremiumBtn = document.querySelector('#cancelPremiumBtn');
  const cashTopUpBtn = document.querySelector('#cashTopUpBtn');
  const bankTopUpBtn = document.querySelector('#bankTopUpBtn');

  const startScanBtn = null;
  const stopScanBtn = null;
  const qrVideo = null;
  const qrCanvas = null;
  const qrFallbackInput = null;
  const processFallbackBtn = null;
  let profileEditing = false;

  function setProfileEditMode(editing) {
    profileEditing = editing;
    [profileNameInput, profileCedulaInput, profileEmailInput, profilePhoneInput, profilePlateInput, profileVehicleModelInput].forEach((el) => {
      if (!el) return;
      el.disabled = !editing;
    });
    if (profileEditBtn) profileEditBtn.hidden = editing;
    if (profileSaveBtn) profileSaveBtn.hidden = !editing;
  }

  function renderHistory(user) {
    historyList.innerHTML = '';
    if (!user.history.length) {
      historyList.innerHTML = '<p class="history-item">Aún no hay registros.</p>';
      return;
    }

    const sorted = [...user.history].sort((a, b) => (a.date < b.date ? 1 : -1));
    sorted.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'history-item';
      row.textContent = `${new Date(item.date).toLocaleString('es-CO')} | ${item.detail}`;
      historyList.appendChild(row);
    });
  }

  function render() {
    const data = getData();
    const user = getCurrentUser(data);
    if (!user) {
      dashboard.hidden = true;
      sessionGuard.hidden = false;
      return;
    }

    Object.assign(user, normalizeUser(user));
    applyMonthlyReset(user);
    syncAvailableWashes(user);
    saveData(data);

    sessionGuard.hidden = true;
    dashboard.hidden = false;
    welcomeUser.textContent = `Hola, ${user.name}`;

    const plan = getPlanDescriptor(user);
    subscriptionType.textContent = plan.name;
    subscriptionBadge.classList.remove('sub-basic', 'sub-premium');
    subscriptionBadge.classList.add(plan.badgeClass);
    subscriptionStatus.textContent = plan.status;
    if (subscriptionBenefits) {
      subscriptionBenefits.textContent =
        user.plan.mode === 'premium_monthly'
          ? '2 lavadas mensuales, descuento por lavada y renovación automática del ciclo.'
          : 'Pago por uso, control total de recargas y consumo por lavada.';
    }
    if (subscriptionWashesLeft) {
      subscriptionWashesLeft.textContent = `${user.plan.washesRemaining}`;
    }
    if (subscriptionBalance) {
      subscriptionBalance.textContent = `${formatCOP(user.wallet)}`;
    }
    if (subscriptionCycleStart) {
      subscriptionCycleStart.textContent = `${formatShortDate(user.plan.cycleStart)}`;
    }
    if (subscriptionCycleEnd) {
      subscriptionCycleEnd.textContent = `${formatShortDate(user.plan.cycleEnd)}`;
    }
    if (setPremiumMonthlyBtn) setPremiumMonthlyBtn.hidden = user.plan.mode === 'premium_monthly';
    if (cancelPremiumBtn) cancelPremiumBtn.hidden = user.plan.mode !== 'premium_monthly';

    walletStatus.textContent = `Saldo: ${formatCOP(user.wallet)} COP`;
    paymentStatus.textContent = `Método: ${user.paymentMethod}${user.stripeLinked ? ' (vinculado)' : ''}`;
    if (profileNameInput) profileNameInput.value = user.name || '';
    if (profileCedulaInput) profileCedulaInput.value = user.cedula || '';
    if (profileEmailInput) profileEmailInput.value = user.email || '';
    if (profilePhoneInput) profilePhoneInput.value = user.phone || '';
    if (profilePlateInput) profilePlateInput.value = user.plate || '';
    if (profileVehicleModelInput) profileVehicleModelInput.value = user.vehicleModel || '';
    if (profileWashesDone) profileWashesDone.textContent = `Lavadas realizadas: ${user.stats.washesDone}`;
    if (userQrImage) userQrImage.src = getQrImageUrl(getUserQrPayload(user), 170);
    if (userQrCode) userQrCode.textContent = getUserQrPayload(user);

    setProfileEditMode(false);
    renderHistory(user);
  }

  function mutateCurrentUser(mutator) {
    const data = getData();
    const user = getCurrentUser(data);
    if (!user) return null;
    mutator(user, data);
    saveData(data);
    render();
    return user;
  }

  function processScannedQr(rawValue) {
    const parsed = parseQrPayload(rawValue);
    if (!parsed) {
      setResult(washMessage, 'QR inválido. Usa QR de cliente Nova Wash.', 'error');
      return;
    }

    const data = getData();
    const user = getCurrentUser(data);
    if (!user) {
      setResult(washMessage, 'No hay sesión activa.', 'error');
      return;
    }

    let plateToUse = '';
    if (parsed.type === 'user_token') {
      if (String(user.qrToken).toUpperCase() !== String(parsed.value).toUpperCase()) {
        setResult(washMessage, 'Este QR pertenece a otro cliente.', 'error');
        return;
      }
      plateToUse = user.plate || '';
    } else {
      plateToUse = parsed.value;
      user.plate = parsed.value;
    }

    if (!plateToUse || plateToUse.length < 5) {
      setResult(washMessage, 'Este cliente no tiene placa registrada. Actualízala en perfil o backoffice.', 'error');
      return;
    }

    const result = consumeWashByPlan(user, plateToUse);
    if (!result.ok) {
      setResult(washMessage, result.message, 'error');
      return;
    }

    saveData(data);
    render();
    playScanBeep();
    setResult(washMessage, result.message, 'success');
  }

  const startScanner = () => {};
  const stopScanner = () => {};

  logoutBtn?.addEventListener('click', () => {
    stopScanner();
    const data = getData();
    data.currentUserEmail = null;
    saveData(data);
    window.location.href = 'login.html';
  });

  setPremiumMonthlyBtn?.addEventListener('click', () => {
    mutateCurrentUser((user) => {
      user.plan.mode = 'premium_monthly';
      user.plan.cycleStart = nowISO();
      user.plan.cycleEnd = oneMonthFromNowISO();
      user.plan.usedPlates = [];
      user.wallet = PRICES.premiumMonthlyFee;
      syncAvailableWashes(user);
      addHistory(user, `Suscripción Premium activada por ${formatCOP(PRICES.premiumMonthlyFee)}.`, 'plan');
    });
  });

  cancelPremiumBtn?.addEventListener('click', () => {
    mutateCurrentUser((user) => {
      if (user.plan.mode !== 'premium_monthly') return;
      user.plan.mode = 'basic_single';
      user.plan.cycleStart = null;
      user.plan.cycleEnd = null;
      user.plan.usedPlates = [];
      syncAvailableWashes(user);
      addHistory(user, 'Plan Premium cancelado. Se activa Plan Básico.', 'plan');
    });
  });

  profileEditBtn?.addEventListener('click', () => {
    setResult(profileMessage, '');
    setProfileEditMode(true);
    profileNameInput?.focus();
  });

  profileSaveBtn?.addEventListener('click', () => {
    const data = getData();
    data.users = data.users.map((entry) => normalizeUser(entry));
    const user = getCurrentUser(data);
    if (!user) return;

    const oldEmail = String(user.email || '').toLowerCase();
    const nextName = String(profileNameInput?.value || '').trim();
    const nextCedula = String(profileCedulaInput?.value || '').trim();
    const nextEmail = String(profileEmailInput?.value || '').trim().toLowerCase();
    const nextPhone = String(profilePhoneInput?.value || '').trim();
    const nextPlate = normalizePlate(String(profilePlateInput?.value || ''));
    const nextVehicleModel = String(profileVehicleModelInput?.value || '').trim();

    if (!nextName) {
      setResult(profileMessage, 'El nombre es obligatorio.', 'error');
      return;
    }
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail);
    if (!emailValid) {
      setResult(profileMessage, 'Correo inválido. Verifica el formato.', 'error');
      return;
    }
    const duplicate = data.users.some((u) => String(u.email || '').toLowerCase() === nextEmail && u.userId !== user.userId);
    if (duplicate) {
      setResult(profileMessage, 'Ese correo ya está registrado.', 'error');
      return;
    }

    user.name = nextName;
    user.cedula = nextCedula;
    user.email = nextEmail;
    user.phone = nextPhone;
    user.plate = nextPlate;
    user.vehicleModel = nextVehicleModel;

    if (data.currentUserEmail && data.currentUserEmail.toLowerCase() === oldEmail) {
      data.currentUserEmail = nextEmail;
    }
    addHistory(user, 'Perfil actualizado por el cliente desde panel de gestión.', 'perfil');
    saveData(data);
    setResult(profileMessage, 'Perfil actualizado correctamente.', 'success');
    render();
  });

  cashTopUpBtn?.addEventListener('click', () => {
    window.alert(
      'En el Lavadero de NOVAWASH podrás recargar tu cuenta con efectivo. Ubicación: Cedritos, Cra 7D #145-51, Bogotá. Celular: 3046040723.'
    );
  });

  bankTopUpBtn?.addEventListener('click', () => {
    window.alert(
      'Nequi: 3046040723. Bancolombia Ahorros a nombre de Mauricio Ospina, No. 91214106413. Envía el comprobante al 3046040723. En 10 min validaremos para activar créditos en la cuenta.'
    );
  });

  startScanBtn?.addEventListener('click', startScanner);
  stopScanBtn?.addEventListener('click', () => {
    stopScanner();
    setResult(washMessage, 'Lector detenido.');
  });

  processFallbackBtn?.addEventListener('click', () => {
    const value = qrFallbackInput.value;
    processScannedQr(value);
    qrFallbackInput.value = '';
  });

  window.addEventListener('beforeunload', stopScanner);
  render();
}

if (document.querySelector('#loginForm') || document.querySelector('#signupForm') || document.querySelector('#arrivalForm')) {
  initLandingPage();
}

if (document.querySelector('#dashboard')) {
  initDashboardPage();
}

function initBackofficePage() {
  const boLoginCard = document.querySelector('#boLoginCard');
  const boLoginForm = document.querySelector('#boLoginForm');
  const boUserInput = document.querySelector('#boUser');
  const boPassInput = document.querySelector('#boPass');
  const boLoginMessage = document.querySelector('#boLoginMessage');
  const boPanelMessage = document.querySelector('#boPanelMessage');
  const backofficePanel = document.querySelector('#backofficePanel');
  const boUsersBody = document.querySelector('#boUsersBody');
  const boUsersMobile = document.querySelector('#boUsersMobile');
  const boModal = document.querySelector('#boModal');
  const boModalForm = document.querySelector('#boModalForm');
  const boModalTitle = document.querySelector('#boModalTitle');
  const boModalClose = document.querySelector('#boModalClose');
  const boModalEditWrap = document.querySelector('#boModalEditWrap');
  const boModalUserId = document.querySelector('#boModalUserId');
  const boModalName = document.querySelector('#boModalName');
  const boModalCedula = document.querySelector('#boModalCedula');
  const boModalEmail = document.querySelector('#boModalEmail');
  const boModalPlate = document.querySelector('#boModalPlate');
  const boModalPhone = document.querySelector('#boModalPhone');
  const boModalMode = document.querySelector('#boModalMode');
  const boModalWallet = document.querySelector('#boModalWallet');
  const boModalPaymentMethod = document.querySelector('#boModalPaymentMethod');
  const boModalCycleStart = document.querySelector('#boModalCycleStart');
  const boModalCycleEnd = document.querySelector('#boModalCycleEnd');
  const boModalWashesRemaining = document.querySelector('#boModalWashesRemaining');
  const boModalWashesDone = document.querySelector('#boModalWashesDone');
  const boModalCancelSubBtn = document.querySelector('#boModalCancelSubBtn');
  const boModalMessage = document.querySelector('#boModalMessage');
  const boModalCancel = document.querySelector('#boModalCancel');
  const boModalDismiss = document.querySelector('#boModalDismiss');
  const boSaveAllBtn = document.querySelector('#boSaveAllBtn');
  const boAuditBody = document.querySelector('#boAuditBody');
  const boAuditCount = document.querySelector('#boAuditCount');
  const boAuditPageText = document.querySelector('#boAuditPageText');
  const boAuditPrevBtn = document.querySelector('#boAuditPrevBtn');
  const boAuditNextBtn = document.querySelector('#boAuditNextBtn');
  const boMetricUsers = document.querySelector('#boMetricUsers');
  const boMetricCash = document.querySelector('#boMetricCash');
  const boMetricSubs = document.querySelector('#boMetricSubs');
  const boMetricFiltered = document.querySelector('#boMetricFiltered');
  const boMetricWashesDone = document.querySelector('#boMetricWashesDone');
  const boMetricWashesAvailable = document.querySelector('#boMetricWashesAvailable');
  const boMetricWallets = document.querySelector('#boMetricWallets');
  const boSearchInput = document.querySelector('#boSearchInput');
  const boDateFrom = document.querySelector('#boDateFrom');
  const boDateTo = document.querySelector('#boDateTo');
  const boResetFiltersBtn = document.querySelector('#boResetFiltersBtn');
  const boPresetToday = document.querySelector('#boPresetToday');
  const boPresetYesterday = document.querySelector('#boPresetYesterday');
  const boPresetLast7 = document.querySelector('#boPresetLast7');
  const boPresetMonth = document.querySelector('#boPresetMonth');
  const boPresetYear = document.querySelector('#boPresetYear');
  const boAuditClientInput = document.querySelector('#boAuditClientInput');
  const boAuditTypeAllBtn = document.querySelector('#boAuditTypeAllBtn');
  const boAuditTypeRechargeBtn = document.querySelector('#boAuditTypeRechargeBtn');
  const boAuditTypeEditBtn = document.querySelector('#boAuditTypeEditBtn');
  const boAuditTypeExpiryBtn = document.querySelector('#boAuditTypeExpiryBtn');
  const boQrVideo = document.querySelector('#boQrVideo');
  const boQrCanvas = document.querySelector('#boQrCanvas');
  const boStartScanBtn = document.querySelector('#boStartScanBtn');
  const boStopScanBtn = document.querySelector('#boStopScanBtn');
  const boQrFallbackInput = document.querySelector('#boQrFallbackInput');
  const boProcessQrBtn = document.querySelector('#boProcessQrBtn');
  const boScanMessage = document.querySelector('#boScanMessage');
  const boAddUserBtn = document.querySelector('#boAddUserBtn');
  const boLogoutBtn = document.querySelector('#boLogoutBtn');
  if (!boLoginForm || !backofficePanel || !boUsersBody || !boAuditBody) return;

  const filters = {
    query: '',
    from: '',
    to: '',
    auditClient: '',
    auditType: 'all',
  };
  const auditPageSize = 50;
  let auditPage = 1;
  let boStream = null;
  let boScanInterval = null;
  let boDetecting = false;
  let remoteSyncInterval = null;
  const seenAuditKeys = new Set();
  const modalState = {
    type: '',
    userIndex: -1,
  };

  function auditKey(log) {
    return `${log?.at || ''}|${log?.action || ''}|${log?.targetEmail || ''}|${log?.detail || ''}|${log?.amount || ''}`;
  }

  function registerExistingAudits(data) {
    (data.auditLogs || []).forEach((log) => {
      seenAuditKeys.add(auditKey(log));
    });
  }

  function showFloatingNotice(message) {
    let wrap = document.querySelector('#floatingNoticeWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'floatingNoticeWrap';
      wrap.className = 'floating-notice-wrap';
      document.body.appendChild(wrap);
    }
    const note = document.createElement('div');
    note.className = 'floating-notice';
    note.textContent = message;
    wrap.appendChild(note);
    setTimeout(() => {
      note.remove();
      if (!wrap.childElementCount) wrap.remove();
    }, 4500);
  }

  function pushBrowserPaymentNotification(message) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification('Nova Wash Backoffice', { body: message });
      return;
    }
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          new Notification('Nova Wash Backoffice', { body: message });
        }
      });
    }
  }

  function buildPaymentNotice(log, data) {
    const amount = Number(log.amount) || 0;
    const user = data.users.find((u) => String(u.email || '').toLowerCase() === String(log.targetEmail || '').toLowerCase());
    const name = user?.name || log.targetEmail || 'Cliente';
    return `Pago registrado: ${name}${amount > 0 ? ` por ${formatCOP(amount)}` : ''}.`;
  }

  function stopRemoteSync() {
    if (remoteSyncInterval) {
      clearInterval(remoteSyncInterval);
      remoteSyncInterval = null;
    }
  }

  async function syncBackofficeFromRemote(withNotifications = false) {
    const remoteData = await fetchRemoteStateAsync();
    if (!remoteData) return;
    if (hasUnsyncedLocalChanges || pendingRemoteState) return;

    const localData = getData();
    const remoteVersion = Number(remoteData.stateUpdatedAt) || 0;
    const localVersion = Number(localData.stateUpdatedAt) || 0;
    if (remoteVersion < localVersion) return;

    const newPaymentLogs = [];
    (remoteData.auditLogs || []).forEach((log) => {
      const key = auditKey(log);
      if (seenAuditKeys.has(key)) return;
      seenAuditKeys.add(key);
      if (withNotifications && log.action === 'manual_cash_payment') {
        newPaymentLogs.push(log);
      }
    });

    appDataCache = remoteData;
    writeLocalState(remoteData);
    renderUsers();
    renderAudit();

    newPaymentLogs.slice(-3).forEach((log) => {
      const message = buildPaymentNotice(log, remoteData);
      showFloatingNotice(message);
      pushBrowserPaymentNotification(message);
    });
  }

  function startRemoteSync() {
    stopRemoteSync();
    remoteSyncInterval = setInterval(() => {
      if (!isLogged()) return;
      syncBackofficeFromRemote(true);
    }, 8000);
  }

  function matchesAuditType(log, type) {
    if (type === 'all') return true;
    if (type === 'recharge') return log.action === 'manual_cash_payment';
    if (type === 'edit') return ['bulk_update_users', 'create_user', 'delete_user', 'change_password', 'expiry_update'].includes(log.action);
    if (type === 'expiry') return ['subscription_renewal', 'expiry_update'].includes(log.action);
    return true;
  }

  function applyBackofficeMonthlyResets(data, actor = 'sistema') {
    let changed = false;
    data.users.forEach((user) => {
      const didReset = applyMonthlyReset(user, data, actor);
      if (didReset) changed = true;
    });
    return changed;
  }

  function isLogged() {
    return localStorage.getItem(BO_SESSION_KEY) === '1';
  }

  function setLogged(value) {
    localStorage.setItem(BO_SESSION_KEY, value ? '1' : '0');
  }

  function isWithinDateRange(iso, from, to) {
    if (!iso) return true;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return true;
    if (from) {
      const fromDate = new Date(`${from}T00:00:00`);
      if (date < fromDate) return false;
    }
    if (to) {
      const toDate = new Date(`${to}T23:59:59.999`);
      if (date > toDate) return false;
    }
    return true;
  }

  function toInputDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function applyDatePreset(fromDate, toDate) {
    filters.from = toInputDate(fromDate);
    filters.to = toInputDate(toDate);
    if (boDateFrom) boDateFrom.value = filters.from;
    if (boDateTo) boDateTo.value = filters.to;
    auditPage = 1;
    renderUsers();
    renderAudit();
  }

  function getFilteredUsers(data) {
    const query = filters.query.trim().toLowerCase();
    return data.users.filter((user, idx) => {
      const byDate = isWithinDateRange(user.createdAt, filters.from, filters.to);
      if (!byDate) return false;
      if (!query) return true;
      const id = String(user.userId || '');
      const name = String(user.name || '');
      const email = String(user.email || '');
      const cedula = String(user.cedula || '');
      const rawIndexId = `id-${idx + 1}`;
      return (
        id.toLowerCase().includes(query) ||
        name.toLowerCase().includes(query) ||
        email.toLowerCase().includes(query) ||
        cedula.toLowerCase().includes(query) ||
        rawIndexId.includes(query)
      );
    });
  }

  function renderMetrics(data, filteredUsers) {
    const activeSubs = data.users.filter((user) => user.plan.mode === 'premium_monthly').length;
    const totalWashesDone = data.users.reduce((sum, user) => sum + (Number(user?.stats?.washesDone) || 0), 0);
    const totalWashesAvailable = data.users.reduce((sum, user) => sum + (Number(user?.plan?.washesRemaining) || 0), 0);
    const totalWalletBalance = data.users.reduce((sum, user) => sum + (Number(user?.wallet) || 0), 0);
    const cashIncome = (data.auditLogs || [])
      .filter((log) => log.action === 'manual_cash_payment')
      .filter((log) => isWithinDateRange(log.at, filters.from, filters.to))
      .reduce((sum, log) => sum + (Number(log.amount) || 0), 0);

    if (boMetricUsers) boMetricUsers.textContent = String(data.users.length);
    if (boMetricSubs) boMetricSubs.textContent = String(activeSubs);
    if (boMetricFiltered) boMetricFiltered.textContent = String(filteredUsers.length);
    if (boMetricCash) boMetricCash.textContent = formatCOP(cashIncome);
    if (boMetricWashesDone) boMetricWashesDone.textContent = String(totalWashesDone);
    if (boMetricWashesAvailable) boMetricWashesAvailable.textContent = String(totalWashesAvailable);
    if (boMetricWallets) boMetricWallets.textContent = formatCOP(totalWalletBalance);
  }

  function renderUsers() {
    const esc = (value) =>
      String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

    const data = getData();
    data.users = data.users.map((user) => normalizeUser(user));
    const didReset = applyBackofficeMonthlyResets(data, BO_USER);
    let didSyncChange = false;
    data.users.forEach((user) => {
      const before = Number(user.plan?.washesRemaining) || 0;
      const after = syncAvailableWashes(user);
      if (before !== after) didSyncChange = true;
    });
    if (didReset || didSyncChange) {
      saveData(data);
    }
    const filteredUsers = getFilteredUsers(data);
    renderMetrics(data, filteredUsers);

    boUsersBody.innerHTML = '';
    if (boUsersMobile) boUsersMobile.innerHTML = '';
    if (filteredUsers.length === 0) {
      boUsersBody.innerHTML = '<tr><td colspan=\"13\">No hay usuarios para los filtros aplicados.</td></tr>';
      if (boUsersMobile) boUsersMobile.innerHTML = '<p class="bo-mobile-empty">No hay usuarios para los filtros aplicados.</p>';
      return;
    }

    filteredUsers.forEach((user) => {
      const idx = data.users.findIndex((u) => u.userId === user.userId);
      const row = document.createElement('tr');
      row.dataset.userIndex = String(idx);
      row.innerHTML = `
        <td class="bo-col-id bo-id-cell">${esc(user.userId || '-')}</td>
        <td class="bo-col-name">
          <div class="bo-cell-user bo-col-name">
            <input class="bo-edit-field" name="name" type="text" value="${esc(user.name)}" disabled />
            <small>ID cliente</small>
          </div>
        </td>
        <td class="bo-col-cedula"><input class="bo-edit-field" name="cedula" type="text" value="${esc(user.cedula || '')}" disabled /></td>
        <td class="bo-col-email"><input class="bo-edit-field" name="email" type="email" value="${esc(user.email)}" disabled /></td>
        <td class="bo-col-plate"><input class="bo-edit-field" name="plate" type="text" value="${esc(user.plate || '')}" disabled /></td>
        <td><input class="bo-edit-field" name="phone" type="text" value="${esc(user.phone || '')}" disabled /></td>
        <td>
          <select class="bo-edit-field" name="mode" disabled>
            <option value="basic_single" ${user.plan.mode === 'basic_single' ? 'selected' : ''}>Básico</option>
            <option value="premium_monthly" ${user.plan.mode === 'premium_monthly' ? 'selected' : ''}>Premium</option>
          </select>
        </td>
        <td class="bo-col-mini"><input class="bo-edit-field" name="washesRemaining" type="number" min="0" max="999" value="${user.plan.washesRemaining}" disabled /></td>
        <td class="bo-col-mini"><input class="bo-edit-field" name="washesDone" type="number" min="0" max="999" value="${user.stats.washesDone}" disabled /></td>
        <td class="bo-col-wallet"><input class="bo-edit-field" name="wallet" type="number" min="0" value="${user.wallet}" disabled /></td>
        <td class="bo-col-payment">
          <select class="bo-edit-field" name="paymentMethod" disabled>
            <option value="Efectivo en punto" ${user.paymentMethod === 'Efectivo en punto' ? 'selected' : ''}>Efectivo</option>
            <option value="Tarjeta Stripe" ${user.paymentMethod === 'Tarjeta Stripe' ? 'selected' : ''}>Stripe</option>
            <option value="Tarjeta crédito/débito" ${user.paymentMethod === 'Tarjeta crédito/débito' ? 'selected' : ''}>Tarjeta crédito/débito</option>
            <option value="Nequi" ${user.paymentMethod === 'Nequi' ? 'selected' : ''}>Nequi</option>
          </select>
        </td>
        <td class="bo-col-recharge"><input class="bo-recharge-input" name="cashAmount" type="number" min="0" value="" placeholder="$" /></td>
        <td class="bo-actions-cell">
          <button class="btn btn-orange bo-btn" type="button" data-action="cash">Recarga</button>
          <div class="bo-menu">
            <button class="bo-menu-trigger" type="button" data-action="toggle-menu" aria-label="Más opciones">...</button>
            <div class="bo-menu-list" hidden>
              <button class="bo-menu-item" type="button" data-action="edit">Editar ✎</button>
              <button class="bo-menu-item" type="button" data-action="change-password">Cambiar contraseña</button>
              <button class="bo-menu-item" type="button" data-action="cancel-subscription">Cancelar suscripción</button>
              <button class="bo-menu-item danger" type="button" data-action="delete">Eliminar usuario</button>
            </div>
          </div>
        </td>
      `;
      boUsersBody.appendChild(row);

      if (boUsersMobile) {
        const card = document.createElement('article');
        card.className = 'bo-mobile-card';
        card.dataset.userIndex = String(idx);
        card.innerHTML = `
          <div class="bo-mobile-head">
            <h5>${esc(user.name || 'Cliente')}</h5>
            <small>${esc(user.userId || '-')}</small>
          </div>
          <p><strong>Correo:</strong> ${esc(user.email || '-')}</p>
          <p><strong>Placa:</strong> ${esc(user.plate || '-')}</p>
          <p><strong>Teléfono:</strong> ${esc(user.phone || '-')}</p>
          <p><strong>Plan:</strong> ${user.plan.mode === 'premium_monthly' ? 'Premium' : 'Básico'}</p>
          <p><strong>Disponibles:</strong> ${Number(user.plan.washesRemaining) || 0} | <strong>Realizadas:</strong> ${Number(user.stats.washesDone) || 0}</p>
          <p><strong>Saldo:</strong> ${formatCOP(Number(user.wallet) || 0)}</p>
          <label class="bo-mobile-recharge-label">
            Recarga
            <input class="bo-recharge-input" name="cashAmount" type="number" min="0" value="" placeholder="$" />
          </label>
          <div class="bo-actions-cell">
            <button class="btn btn-orange bo-btn" type="button" data-action="cash">Recarga</button>
            <div class="bo-menu">
              <button class="bo-menu-trigger" type="button" data-action="toggle-menu" aria-label="Más opciones">...</button>
              <div class="bo-menu-list" hidden>
                <button class="bo-menu-item" type="button" data-action="edit">Editar ✎</button>
                <button class="bo-menu-item" type="button" data-action="change-password">Cambiar contraseña</button>
                <button class="bo-menu-item" type="button" data-action="cancel-subscription">Cancelar suscripción</button>
                <button class="bo-menu-item danger" type="button" data-action="delete">Eliminar usuario</button>
              </div>
            </div>
          </div>
        `;
        boUsersMobile.appendChild(card);
      }
    });
  }

  function closeAllRowMenus() {
    document.querySelectorAll('.bo-menu-list').forEach((menu) => {
      menu.hidden = true;
    });
  }

  function handleUserAction(event) {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    const row = btn.closest('[data-user-index]');
    if (!row) return;
    const idx = Number(row.dataset.userIndex);
    const data = getData();
    data.users = data.users.map((user) => normalizeUser(user));
    const user = data.users[idx];
    if (!user) return;
    const input = (name) => row.querySelector(`[name="${name}"]`);

    if (btn.dataset.action === 'cash') {
      const amount = Math.max(0, Number(input('cashAmount')?.value || 0));
      if (amount <= 0) return;
      const addedWashes = applyRechargeToUser(user, amount);
      user.paymentMethod = 'Efectivo en punto';
      const suffix = addedWashes > 0 ? ` + ${addedWashes} lavadas premium.` : '';
      addHistory(user, `Backoffice: pago en efectivo registrado por ${formatCOP(amount)}.${suffix}`, 'pago');
      addAuditEntry(
        data,
        BO_USER,
        user.email,
        'manual_cash_payment',
        `Recarga manual en efectivo por ${formatCOP(amount)}.${suffix}`,
        { amount, addedWashes }
      );
      saveData(data);
      const notice = `Recarga manual aplicada: ${formatCOP(amount)} a ${user.name}.`;
      showFloatingNotice(notice);
      pushBrowserPaymentNotification(notice);
      setResult(boPanelMessage, `Recarga manual aplicada: ${formatCOP(amount)}.`, 'success');
      render();
      return;
    }

    if (btn.dataset.action === 'toggle-menu') {
      closeAllRowMenus();
      const menu = row.querySelector('.bo-menu-list');
      if (menu) menu.hidden = !menu.hidden;
      return;
    }

    if (btn.dataset.action === 'edit') {
      openModal('edit', idx);
      closeAllRowMenus();
      return;
    }

    if (btn.dataset.action === 'change-password') {
      const nextPassword = window.prompt(`Nueva contraseña para ${user.email}:`, '');
      if (nextPassword === null) {
        closeAllRowMenus();
        return;
      }
      const cleanPassword = String(nextPassword).trim();
      if (cleanPassword.length < 6) {
        setResult(boPanelMessage, 'La contraseña debe tener al menos 6 caracteres.', 'error');
        closeAllRowMenus();
        return;
      }
      user.password = cleanPassword;
      addAuditEntry(data, BO_USER, user.email, 'change_password', 'Cambio de contraseña desde backoffice.');
      saveData(data);
      setResult(boPanelMessage, 'Contraseña actualizada correctamente.', 'success');
      closeAllRowMenus();
      render();
      return;
    }

    if (btn.dataset.action === 'cancel-subscription') {
      if (user.plan.mode !== 'premium_monthly') {
        setResult(boPanelMessage, 'El cliente ya está en plan básico.', 'error');
        closeAllRowMenus();
        return;
      }
      user.plan.mode = 'basic_single';
      user.plan.cycleStart = null;
      user.plan.cycleEnd = null;
      user.plan.usedPlates = [];
      syncAvailableWashes(user);
      addHistory(user, 'Suscripción premium cancelada desde backoffice.', 'plan');
      addAuditEntry(data, BO_USER, user.email, 'cancel_subscription', 'Suscripción cancelada y cambio a Plan Básico.');
      saveData(data);
      setResult(boPanelMessage, 'Suscripción cancelada. Cliente en Plan Básico.', 'success');
      closeAllRowMenus();
      render();
      return;
    }

    if (btn.dataset.action === 'delete') {
      const removedEmail = user.email;
      data.users.splice(idx, 1);
      if (data.currentUserEmail && data.currentUserEmail.toLowerCase() === removedEmail.toLowerCase()) {
        data.currentUserEmail = null;
      }
      addAuditEntry(data, BO_USER, removedEmail, 'delete_user', 'Usuario eliminado desde backoffice.');
      saveData(data);
      setResult(boPanelMessage, 'Usuario eliminado correctamente.', 'success');
      closeAllRowMenus();
      render();
    }
  }

  function closeModal() {
    if (!boModal) return;
    boModal.hidden = true;
    modalState.type = '';
    modalState.userIndex = -1;
    if (boModalEditWrap) boModalEditWrap.hidden = true;
    setResult(boModalMessage, '');
  }

  function openModal(type, userIndex) {
    if (!boModal || !boModalTitle || !boModalEditWrap) return;
    const data = getData();
    data.users = data.users.map((user) => normalizeUser(user));
    const user = data.users[userIndex];
    if (!user) return;

    modalState.type = type;
    modalState.userIndex = userIndex;
    boModal.hidden = false;
    setResult(boModalMessage, '');
    boModalEditWrap.hidden = true;
    if (type === 'edit') {
      boModalTitle.textContent = `Editar cliente - ${user.name}`;
      boModalEditWrap.hidden = false;
      if (boModalUserId) boModalUserId.value = String(user.userId || '');
      if (boModalName) boModalName.value = String(user.name || '');
      if (boModalCedula) boModalCedula.value = String(user.cedula || '');
      if (boModalEmail) boModalEmail.value = String(user.email || '');
      if (boModalPlate) boModalPlate.value = String(user.plate || '');
      if (boModalPhone) boModalPhone.value = String(user.phone || '');
      if (boModalMode) boModalMode.value = String(user.plan.mode || 'basic_single');
      if (boModalWallet) boModalWallet.value = String(Number(user.wallet) || 0);
      if (boModalPaymentMethod) boModalPaymentMethod.value = String(user.paymentMethod || 'Efectivo en punto');
      if (boModalCycleStart) boModalCycleStart.value = formatShortDate(user.plan?.cycleStart);
      if (boModalCycleEnd) boModalCycleEnd.value = formatShortDate(user.plan?.cycleEnd);
      if (boModalWashesRemaining) boModalWashesRemaining.value = String(Number(user.plan?.washesRemaining) || 0);
      if (boModalWashesDone) boModalWashesDone.value = String(Number(user.stats?.washesDone) || 0);
      if (boModalCancelSubBtn) boModalCancelSubBtn.hidden = user.plan.mode !== 'premium_monthly';
      boModalName?.focus();
      return;
    }

    boModalTitle.textContent = `Editar cliente - ${user.name}`;
  }

  function getAuditClientLabel(data, targetEmail) {
    if (!targetEmail || targetEmail === '-') return '-';
    const user = data.users.find((u) => String(u.email || '').toLowerCase() === String(targetEmail).toLowerCase());
    if (!user) return targetEmail;
    return `${user.name} (${user.userId})`;
  }

  function renderAudit() {
    const data = getData();
    data.users = data.users.map((user) => normalizeUser(user));
    const logs = Array.isArray(data.auditLogs) ? [...data.auditLogs] : [];
    const filteredLogs = logs
      .filter((log) => isWithinDateRange(log.at, filters.from, filters.to))
      .filter((log) => matchesAuditType(log, filters.auditType))
      .filter((log) => {
        const q = filters.auditClient.trim().toLowerCase();
        if (!q) return true;
        const target = String(log.targetEmail || '').toLowerCase();
        const detail = String(log.detail || '').toLowerCase();
        const matchedUser = data.users.find((u) =>
          String(u.email || '').toLowerCase() === target &&
          (`${u.name} ${u.userId} ${u.email} ${u.cedula || ''}`).toLowerCase().includes(q)
        );
        return target.includes(q) || detail.includes(q) || Boolean(matchedUser);
      })
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    boAuditBody.innerHTML = '';

    if (filteredLogs.length === 0) {
      boAuditBody.innerHTML = '<tr><td colspan="5">Sin movimientos de auditoría.</td></tr>';
      if (boAuditCount) boAuditCount.textContent = `Mostrando 0 de 0 (${auditPageSize} por página)`;
      if (boAuditPageText) boAuditPageText.textContent = 'Página 1';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / auditPageSize));
    if (auditPage > totalPages) auditPage = totalPages;
    if (auditPage < 1) auditPage = 1;
    const start = (auditPage - 1) * auditPageSize;
    const pageLogs = filteredLogs.slice(start, start + auditPageSize);
    const fromItem = filteredLogs.length ? start + 1 : 0;
    const toItem = start + pageLogs.length;

    if (boAuditCount) boAuditCount.textContent = `Mostrando ${fromItem}-${toItem} de ${filteredLogs.length} (${auditPageSize} por página)`;
    if (boAuditPageText) boAuditPageText.textContent = `Página ${auditPage} / ${totalPages}`;
    if (boAuditPrevBtn) boAuditPrevBtn.disabled = auditPage <= 1;
    if (boAuditNextBtn) boAuditNextBtn.disabled = auditPage >= totalPages;

    pageLogs.forEach((log) => {
      const tr = document.createElement('tr');
      const clientLabel = getAuditClientLabel(data, log.targetEmail);
      tr.innerHTML = `
        <td>${new Date(log.at).toLocaleString('es-CO')}</td>
        <td>${log.actor || '-'}</td>
        <td>${clientLabel}</td>
        <td>${log.action || '-'}</td>
        <td>${log.detail || '-'}</td>
      `;
      boAuditBody.appendChild(tr);
    });
  }

  function processOperationalQr(rawValue) {
    const parsed = parseQrPayload(rawValue);
    if (!parsed) {
      setResult(boScanMessage, 'QR inválido. Usa el QR único del cliente.', 'error');
      return;
    }

    const data = getData();
    data.users = data.users.map((user) => normalizeUser(user));
    let user = null;
    let plateToUse = '';

    if (parsed.type === 'user_token') {
      user = findUserByQrToken(data, parsed.value);
      if (!user) {
        setResult(boScanMessage, 'No se encontró cliente para ese QR.', 'error');
        return;
      }
      plateToUse = user.plate || '';
    } else if (parsed.type === 'user_id') {
      user = data.users.find((u) => String(u.userId || '').toUpperCase() === String(parsed.value).toUpperCase()) || null;
      if (!user) {
        setResult(boScanMessage, 'No se encontró cliente para ese ID.', 'error');
        return;
      }
      plateToUse = user.plate || '';
    } else {
      const matches = data.users.filter((u) => normalizePlate(u.plate || '') === parsed.value);
      if (matches.length !== 1) {
        setResult(boScanMessage, 'No se pudo identificar un único cliente por placa.', 'error');
        return;
      }
      user = matches[0];
      plateToUse = parsed.value;
      user.plate = parsed.value;
    }

    if (!plateToUse || plateToUse.length < 5) {
      setResult(boScanMessage, 'El cliente no tiene placa registrada para descontar la lavada.', 'error');
      return;
    }

    const result = consumeWashByPlan(user, plateToUse);
    if (!result.ok) {
      setResult(boScanMessage, result.message, 'error');
      return;
    }

    addAuditEntry(data, BO_USER, user.email, 'qr_wash_operation', `Lavada registrada por QR operativo para placa ${plateToUse}.`);
    saveData(data);
    playScanBeep();
    setResult(boScanMessage, `${result.message} Cliente: ${user.name}.`, 'success');
    render();
  }

  async function startBackofficeScanner() {
    if (!boQrVideo || !boQrCanvas) return;
    if (!('mediaDevices' in navigator)) {
      setResult(boScanMessage, 'Este navegador no soporta acceso a cámara.', 'error');
      return;
    }

    try {
      boStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      boQrVideo.srcObject = boStream;
      await boQrVideo.play();
      setResult(boScanMessage, 'Lector operativo activo.', 'success');

      if (!('BarcodeDetector' in window)) {
        setResult(boScanMessage, 'BarcodeDetector no soportado. Usa campo de código leído.', 'error');
        return;
      }

      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const ctx = boQrCanvas.getContext('2d', { willReadFrequently: true });
      boDetecting = true;

      boScanInterval = setInterval(async () => {
        if (!boDetecting || boQrVideo.readyState < 2) return;
        boQrCanvas.width = boQrVideo.videoWidth;
        boQrCanvas.height = boQrVideo.videoHeight;
        ctx.drawImage(boQrVideo, 0, 0, boQrCanvas.width, boQrCanvas.height);
        try {
          const codes = await detector.detect(boQrCanvas);
          if (codes.length > 0) {
            processOperationalQr(codes[0].rawValue);
            stopBackofficeScanner();
          }
        } catch {
          // No-op.
        }
      }, 700);
    } catch {
      setResult(boScanMessage, 'No se pudo abrir la cámara del equipo.', 'error');
    }
  }

  function stopBackofficeScanner() {
    boDetecting = false;
    if (boScanInterval) {
      clearInterval(boScanInterval);
      boScanInterval = null;
    }
    if (boStream) {
      boStream.getTracks().forEach((track) => track.stop());
      boStream = null;
    }
    if (boQrVideo) boQrVideo.srcObject = null;
  }

  function render() {
    closeModal();
    const logged = isLogged();
    boLoginCard.hidden = logged;
    backofficePanel.hidden = !logged;
    if (logged) {
      const data = getData();
      registerExistingAudits(data);
      renderUsers();
      renderAudit();
      startRemoteSync();
      syncBackofficeFromRemote(false);
    } else {
      stopRemoteSync();
    }
  }

  boLoginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const user = boUserInput.value.trim();
    const pass = boPassInput.value.trim();
    if (user !== BO_USER || pass !== BO_PASS) {
      setResult(boLoginMessage, 'Credenciales inválidas.', 'error');
      return;
    }
    setLogged(true);
    const data = getData();
    addAuditEntry(data, BO_USER, '-', 'login_backoffice', 'Ingreso de personal al backoffice.');
    saveData(data);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {
        // No-op.
      });
    }
    setResult(boLoginMessage, 'Ingreso autorizado.', 'success');
    render();
  });

  boLogoutBtn?.addEventListener('click', () => {
    stopBackofficeScanner();
    stopRemoteSync();
    setLogged(false);
    render();
  });

  boUsersBody.addEventListener('click', handleUserAction);
  boUsersMobile?.addEventListener('click', handleUserAction);

  boSaveAllBtn?.addEventListener('click', () => {
    const data = getData();
    data.users = data.users.map((user) => normalizeUser(user));
    const rows = [...boUsersBody.querySelectorAll('tr[data-user-index]')];
    const nextEmails = new Set();

    for (const row of rows) {
      const idx = Number(row.dataset.userIndex);
      const user = data.users[idx];
      if (!user) continue;
      const input = (name) => row.querySelector(`[name="${name}"]`);

      const oldEmail = String(user.email || '').toLowerCase();
      const newEmail = String(input('email')?.value || '')
        .trim()
        .toLowerCase();
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail);
      if (!emailValid) {
        setResult(boPanelMessage, 'Correo inválido. Verifica el formato del email.', 'error');
        return;
      }
      if (nextEmails.has(newEmail) || data.users.some((u, i) => i !== idx && String(u.email).toLowerCase() === newEmail)) {
        setResult(boPanelMessage, 'Hay correos duplicados en la tabla.', 'error');
        return;
      }
      nextEmails.add(newEmail);

      user.name = String(input('name')?.value || '').trim() || user.name;
      user.cedula = String(input('cedula')?.value || '').trim();
      user.email = newEmail;
      user.phone = String(input('phone')?.value || '').trim();
      user.plate = normalizePlate(String(input('plate')?.value || ''));
      user.plan.mode = String(input('mode')?.value || 'basic_single');
      user.wallet = Math.max(0, Number(input('wallet')?.value || 0));
      user.paymentMethod = String(input('paymentMethod')?.value || 'Efectivo en punto');

      if (user.plan.mode === 'premium_monthly' && !user.plan.cycleEnd) {
        user.plan.cycleStart = nowISO();
        user.plan.cycleEnd = oneMonthFromNowISO();
      }
      if (user.plan.mode === 'basic_single') {
        user.plan.cycleStart = null;
        user.plan.cycleEnd = null;
        user.plan.usedPlates = [];
      }
      syncAvailableWashes(user);

      if (data.currentUserEmail && data.currentUserEmail.toLowerCase() === oldEmail) {
        data.currentUserEmail = newEmail;
      }
      addHistory(user, 'Backoffice: datos de cliente actualizados (guardado masivo).', 'backoffice');
    }

      addAuditEntry(data, BO_USER, '-', 'bulk_update_users', `Guardado masivo de ${rows.length} filas de clientes.`);
    saveData(data);
    setResult(boPanelMessage, 'Todos los cambios fueron guardados correctamente.', 'success');
    render();
  });

  boModalForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = getData();
    data.users = data.users.map((user) => normalizeUser(user));
    const user = data.users[modalState.userIndex];
    if (!user) {
      closeModal();
      return;
    }

    if (modalState.type === 'edit') {
      const newName = String(boModalName?.value || '').trim();
      const newCedula = String(boModalCedula?.value || '').trim();
      const newEmail = String(boModalEmail?.value || '')
        .trim()
        .toLowerCase();
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail);
      if (!newName) {
        setResult(boModalMessage, 'El nombre es obligatorio.', 'error');
        return;
      }
      if (!emailValid) {
        setResult(boModalMessage, 'Correo inválido. Verifica el formato del email.', 'error');
        return;
      }
      const duplicate = data.users.some(
        (u, i) => i !== modalState.userIndex && String(u.email || '').toLowerCase() === newEmail
      );
      if (duplicate) {
        setResult(boModalMessage, 'Ese correo ya existe en otro usuario.', 'error');
        return;
      }

      const oldEmail = String(user.email || '').toLowerCase();
      user.name = newName;
      user.cedula = newCedula;
      user.email = newEmail;
      user.phone = String(boModalPhone?.value || '').trim();
      user.plate = normalizePlate(String(boModalPlate?.value || ''));
      user.plan.mode = String(boModalMode?.value || 'basic_single');
      user.wallet = Math.max(0, Number(boModalWallet?.value || 0));
      user.paymentMethod = String(boModalPaymentMethod?.value || 'Efectivo en punto');

      if (user.plan.mode === 'premium_monthly' && !user.plan.cycleEnd) {
        user.plan.cycleStart = nowISO();
        user.plan.cycleEnd = oneMonthFromNowISO();
      }
      if (user.plan.mode === 'basic_single') {
        user.plan.cycleStart = null;
        user.plan.cycleEnd = null;
        user.plan.usedPlates = [];
      }
      syncAvailableWashes(user);

      if (data.currentUserEmail && data.currentUserEmail.toLowerCase() === oldEmail) {
        data.currentUserEmail = newEmail;
      }
      addHistory(user, 'Backoffice: datos de cliente actualizados desde modal.', 'backoffice');
      addAuditEntry(data, BO_USER, user.email, 'single_update_user', 'Datos actualizados desde modal de edición.');
      saveData(data);
      closeModal();
      setResult(boPanelMessage, 'Cliente actualizado correctamente.', 'success');
      render();
      return;
    }

    closeModal();
  });

  boAddUserBtn?.addEventListener('click', () => {
    const data = getData();
    data.users = data.users.map((user) => normalizeUser(user));
    const stamp = Date.now();
    const newUser = createUser({
      name: `Nuevo Cliente ${data.users.length + 1}`,
      email: `cliente${stamp}@novawash.local`,
      password: '123456',
    });
    data.users.push(newUser);
    addAuditEntry(data, BO_USER, newUser.email, 'create_user', 'Creacion manual de usuario desde backoffice.');
    saveData(data);
    setResult(
      boPanelMessage,
      'Usuario agregado. Edita nombre, correo y contraseña antes de usarlo.',
      'success'
    );
    render();
  });

  boSearchInput?.addEventListener('input', () => {
    filters.query = boSearchInput.value || '';
    renderUsers();
  });

  boDateFrom?.addEventListener('change', () => {
    filters.from = boDateFrom.value || '';
    auditPage = 1;
    renderUsers();
    renderAudit();
  });

  boDateTo?.addEventListener('change', () => {
    filters.to = boDateTo.value || '';
    auditPage = 1;
    renderUsers();
    renderAudit();
  });

  boPresetToday?.addEventListener('click', () => {
    const today = new Date();
    applyDatePreset(today, today);
  });

  boPresetYesterday?.addEventListener('click', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    applyDatePreset(yesterday, yesterday);
  });

  boPresetLast7?.addEventListener('click', () => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 6);
    applyDatePreset(from, to);
  });

  boPresetMonth?.addEventListener('click', () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    applyDatePreset(from, now);
  });

  boPresetYear?.addEventListener('click', () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), 0, 1);
    applyDatePreset(from, now);
  });

  boResetFiltersBtn?.addEventListener('click', () => {
    filters.query = '';
    filters.from = '';
    filters.to = '';
    filters.auditClient = '';
    filters.auditType = 'all';
    if (boSearchInput) boSearchInput.value = '';
    if (boDateFrom) boDateFrom.value = '';
    if (boDateTo) boDateTo.value = '';
    if (boAuditClientInput) boAuditClientInput.value = '';
    auditPage = 1;
    [boAuditTypeAllBtn, boAuditTypeRechargeBtn, boAuditTypeEditBtn, boAuditTypeExpiryBtn].forEach((btn) => {
      if (!btn) return;
      btn.classList.toggle('is-active', btn === boAuditTypeAllBtn);
    });
    render();
  });

  boAuditClientInput?.addEventListener('input', () => {
    filters.auditClient = boAuditClientInput.value || '';
    auditPage = 1;
    renderAudit();
  });

  function setAuditType(nextType, activeBtn) {
    filters.auditType = nextType;
    auditPage = 1;
    [boAuditTypeAllBtn, boAuditTypeRechargeBtn, boAuditTypeEditBtn, boAuditTypeExpiryBtn].forEach((btn) => {
      if (!btn) return;
      btn.classList.toggle('is-active', btn === activeBtn);
    });
    renderAudit();
  }

  boAuditTypeAllBtn?.addEventListener('click', () => setAuditType('all', boAuditTypeAllBtn));
  boAuditTypeRechargeBtn?.addEventListener('click', () => setAuditType('recharge', boAuditTypeRechargeBtn));
  boAuditTypeEditBtn?.addEventListener('click', () => setAuditType('edit', boAuditTypeEditBtn));
  boAuditTypeExpiryBtn?.addEventListener('click', () => setAuditType('expiry', boAuditTypeExpiryBtn));

  boAuditPrevBtn?.addEventListener('click', () => {
    auditPage -= 1;
    renderAudit();
  });

  boAuditNextBtn?.addEventListener('click', () => {
    auditPage += 1;
    renderAudit();
  });

  boStartScanBtn?.addEventListener('click', startBackofficeScanner);
  boStopScanBtn?.addEventListener('click', () => {
    stopBackofficeScanner();
    setResult(boScanMessage, 'Lector operativo detenido.');
  });
  boProcessQrBtn?.addEventListener('click', () => {
    processOperationalQr(boQrFallbackInput?.value || '');
    if (boQrFallbackInput) boQrFallbackInput.value = '';
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.bo-menu')) {
      closeAllRowMenus();
    }
    if (event.target.closest('[data-modal-close="1"]')) {
      closeModal();
    }
  });

  boModalCancel?.addEventListener('click', closeModal);
  boModalDismiss?.addEventListener('click', closeModal);
  boModalClose?.addEventListener('click', closeModal);
  boModalCancelSubBtn?.addEventListener('click', () => {
    const data = getData();
    data.users = data.users.map((entry) => normalizeUser(entry));
    const user = data.users[modalState.userIndex];
    if (!user) return;
    if (user.plan.mode !== 'premium_monthly') {
      setResult(boModalMessage, 'El cliente ya está en plan básico.', 'error');
      return;
    }
    user.plan.mode = 'basic_single';
    user.plan.cycleStart = null;
    user.plan.cycleEnd = null;
    user.plan.usedPlates = [];
    syncAvailableWashes(user);
    addHistory(user, 'Suscripción premium cancelada desde modal de edición.', 'plan');
    addAuditEntry(data, BO_USER, user.email, 'cancel_subscription', 'Suscripción cancelada desde modal de edición.');
    saveData(data);
    closeModal();
    setResult(boPanelMessage, 'Suscripción cancelada. Cliente en Plan Básico.', 'success');
    render();
  });

  window.addEventListener('beforeunload', () => {
    stopBackofficeScanner();
    stopRemoteSync();
  });

  render();
}

if (document.querySelector('#backofficePanel') || document.querySelector('#boLoginForm')) {
  initBackofficePage();
}

function initKioskPage() {
  const page = document.querySelector('#kioskPage');
  if (!page) return;

  const video = document.querySelector('#kioskQrVideo');
  const canvas = document.querySelector('#kioskQrCanvas');
  const stopBtn = document.querySelector('#kioskStopBtn');
  const message = document.querySelector('#kioskMessage');
  const cooldownEl = document.querySelector('#kioskCooldown');
  const confirmCard = document.querySelector('#kioskConfirmCard');
  const confirmClient = document.querySelector('#kioskConfirmClient');
  const confirmPlate = document.querySelector('#kioskConfirmPlate');
  const confirmCharge = document.querySelector('#kioskConfirmCharge');
  const confirmBalance = document.querySelector('#kioskConfirmBalance');
  const confirmWashes = document.querySelector('#kioskConfirmWashes');

  if (!video || !canvas || !message) return;

  let stream = null;
  let scanInterval = null;
  let detecting = false;
  let cooldownUntil = 0;
  let cooldownInterval = null;
  let confirmHideTimeout = null;

  function hideConfirmation() {
    if (confirmCard) confirmCard.hidden = true;
    if (confirmHideTimeout) {
      clearTimeout(confirmHideTimeout);
      confirmHideTimeout = null;
    }
  }

  function showConfirmation(user, plate, charge) {
    if (!confirmCard) return;
    if (confirmClient) confirmClient.textContent = user.name || '-';
    if (confirmPlate) confirmPlate.textContent = plate || '-';
    if (confirmCharge) confirmCharge.textContent = formatCOP(charge);
    if (confirmBalance) confirmBalance.textContent = formatCOP(user.wallet || 0);
    if (confirmWashes) confirmWashes.textContent = String(user.plan?.washesRemaining || 0);
    confirmCard.hidden = false;
    if (confirmHideTimeout) clearTimeout(confirmHideTimeout);
    confirmHideTimeout = setTimeout(() => {
      hideConfirmation();
    }, 5000);
  }

  function startCooldown(seconds = 5) {
    cooldownUntil = Date.now() + seconds * 1000;
    if (cooldownInterval) clearInterval(cooldownInterval);
    cooldownInterval = setInterval(() => {
      const remainingMs = cooldownUntil - Date.now();
      if (remainingMs <= 0) {
        if (cooldownEl) cooldownEl.textContent = 'Listo para una nueva lectura.';
        clearInterval(cooldownInterval);
        cooldownInterval = null;
        return;
      }
      const sec = Math.ceil(remainingMs / 1000);
      if (cooldownEl) cooldownEl.textContent = `Siguiente lectura disponible en ${sec}s.`;
    }, 200);
  }

  function stopScanner() {
    detecting = false;
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
    if (cooldownInterval) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    video.srcObject = null;
  }

  function processKioskQr(rawValue) {
    if (Date.now() < cooldownUntil) return;

    const parsed = parseQrPayload(rawValue);
    if (!parsed) {
      setResult(message, 'QR inválido. Usa el QR de cliente Nova Wash.', 'error');
      return;
    }

    const data = getData();
    data.users = data.users.map((user) => normalizeUser(user));
    let user = null;
    let plateToUse = '';

    if (parsed.type === 'user_token') {
      user = findUserByQrToken(data, parsed.value);
      if (!user) {
        setResult(message, 'No se encontró cliente para ese QR.', 'error');
        return;
      }
      plateToUse = user.plate || '';
    } else if (parsed.type === 'user_id') {
      user = data.users.find((u) => String(u.userId || '').toUpperCase() === String(parsed.value).toUpperCase()) || null;
      if (!user) {
        setResult(message, 'No se encontró cliente para ese ID.', 'error');
        return;
      }
      plateToUse = user.plate || '';
    } else {
      const matches = data.users.filter((u) => normalizePlate(u.plate || '') === parsed.value);
      if (matches.length !== 1) {
        setResult(message, 'No se pudo identificar un único cliente por placa.', 'error');
        return;
      }
      user = matches[0];
      plateToUse = parsed.value;
      user.plate = parsed.value;
    }

    if (!plateToUse || plateToUse.length < 5) {
      setResult(message, 'El cliente no tiene placa registrada.', 'error');
      return;
    }

    const charge = getWashUnitPriceByPlan(user);
    const result = consumeWashByPlan(user, plateToUse);
    if (!result.ok) {
      setResult(message, result.message, 'error');
      return;
    }

    addAuditEntry(data, 'kiosk', user.email, 'kiosk_qr_wash', `Lavada registrada por lector público para placa ${plateToUse}.`);
    saveData(data);
    playScanBeep();
    showConfirmation(user, plateToUse, charge);
    startCooldown(5);
    setResult(message, `${result.message} Cliente: ${user.name}.`, 'success');
  }

  async function startScanner() {
    if (detecting && stream) return;
    if (!('mediaDevices' in navigator)) {
      setResult(message, 'Este navegador no soporta cámara.', 'error');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      hideConfirmation();
      if (cooldownEl) cooldownEl.textContent = 'Listo para lectura.';
      setResult(message, 'Lector activo. Acerca tu código QR.', 'success');

      if (!('BarcodeDetector' in window)) {
        setResult(message, 'BarcodeDetector no soportado en este equipo.', 'error');
        return;
      }

      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      detecting = true;

      scanInterval = setInterval(async () => {
        if (!detecting || video.readyState < 2) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const codes = await detector.detect(canvas);
          if (codes.length > 0) {
            processKioskQr(codes[0].rawValue);
          }
        } catch {
          // No-op.
        }
      }, 650);
    } catch {
      setResult(message, 'No se pudo abrir la cámara.', 'error');
    }
  }

  stopBtn?.addEventListener('click', () => {
    stopScanner();
    setResult(message, 'Lector detenido.');
  });
  window.addEventListener('beforeunload', stopScanner);
  startScanner();
}

if (document.querySelector('#kioskPage')) {
  initKioskPage();
}
