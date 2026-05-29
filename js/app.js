import {
  loadState,
  saveState,
  uid,
  formatMoney,
  formatDate,
  todayISO,
  nowISO,
  DEFAULT_PROFILE,
  BUSINESS_NAME,
  DEFAULT_PRODUCTS,
  normalizeState,
  syncProductCatalog,
  getLastCatalogPurge,
  markDefaultProductRemoved,
  displayBusinessName,
  resetAppState,
} from './storage.js';
import { validateTransaction, validateEmployee, scanLedger } from './validate.js';
import { payrollSummary, totalPayrollCost } from './payroll.js';
import {
  balanceAt,
  computeTotals,
  periodBounds,
  buildReportJson,
  buildReportMarkdown,
  downloadFile,
} from './reports.js';
import { generateInsights } from './insights.js';
import {
  productUid,
  movementUid,
  computeInventory,
  validateProduct,
  validateMovement,
  inventoryAlerts,
  isBulkPurchaseProduct,
  isCasePurchaseProduct,
  saleUnitLabel,
  purchaseUnitLabel,
  unitsPerPurchase,
  productStockHint,
  formatAchatQtyCell,
  buildAchatMovement,
  normalizeProductFields,
  removeProductCompletely,
  PURCHASE_UNIT_OPTIONS,
  SALE_UNIT_OPTIONS,
} from './inventory.js';
import {
  nextSaleNumber,
  lineTotal,
  printReceipt,
  saleToReceipt,
  paymentLabel,
  PAYMENT_METHODS,
  normalizePaymentMethod,
} from './receipts.js';
import {
  saleUid,
  groupSales,
  getMovementsForSale,
  stockRemaining,
  validateCartLine,
  validateCartCheckout,
  cartGrandTotal,
} from './sales.js';
import {
  getOpenPretSales,
  getPaidPretSales,
  pretByClient,
  totalOpenPret,
  settlePretSale,
  pretPaidDate,
  isPretPayment,
} from './credit.js';
import { auditStockFinance, getLinkedSortie, upsertLinkedAchatSortie, removeAchatMovement, removeStockLinkedTransaction, isStockLinkedTransaction } from './stock-sync.js';
import { renderHelpContent, resetHelpView, initHelpSystem } from './help.js';

let state = loadState();
let editingProductId = null;
let editingMovementId = null;
let saleCart = [];
let editingSaleNumber = null;


function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function init() {
  try {
    if (typeof initFirebaseSync === 'function') {
      // Bloquer l'interface pendant la vérification du Cloud
      document.body.style.opacity = '0.5';
      document.body.style.pointerEvents = 'none';
      
      initFirebaseSync();
      listenToCloud(
        state.updatedAt,
        (cloudState) => {
          localStorage.setItem('etat_financier_v1', JSON.stringify(cloudState));
          location.reload(); // Recharger pour appliquer le nouvel état
        },
        () => {
          // Débloquer l'interface quand le Cloud est prêt (ou a échoué)
          document.body.style.opacity = '1';
          document.body.style.pointerEvents = 'auto';
        }
      );
    }

    bindTabs();
    bindForms();
    renderHelpContent(document.getElementById('help-content'));
    initHelpSystem();
    showCatalogPurgeNotice();
    renderAll();
  } catch (err) {
    console.error(err);
    const box = document.getElementById('demo-status');
    if (box) {
      box.innerHTML = `<div class="alert alert--danger">Erreur au démarrage : ${escapeHtml(err.message)}</div>`;
    }
  }
}

function showCatalogPurgeNotice() {
  const purge = getLastCatalogPurge();
  if (!purge?.removedCount) return;
  const msg = `<div class="alert alert--ok">Produits obsolètes retirés (${purge.removedCount}) : ${purge.removedNames.map(escapeHtml).join(', ')}.</div>`;
  for (const id of ['catalog-purge-notice', 'demo-status']) {
    const box = document.getElementById(id);
    if (box) box.innerHTML = msg;
  }
}

function onSyncCatalog() {
  const purge = syncProductCatalog(state);
  saveState(state);
  if (purge.removedCount > 0) {
    for (const id of ['catalog-purge-notice', 'demo-status']) {
      const box = document.getElementById(id);
      if (box) {
        box.innerHTML = `<div class="alert alert--ok">Anciens produits retirés (${purge.removedCount}) : ${purge.removedNames.map(escapeHtml).join(', ')}.</div>`;
      }
    }
  } else {
    alert('Catalogue à jour — aucun ancien produit trouvé.');
  }
  renderAll();
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('is-active', b === btn));
      document.querySelectorAll('.panel').forEach((p) => {
        p.classList.toggle('is-active', p.id === `panel-${panel}`);
      });
      if (panel === 'aide') {
        resetHelpView(document.getElementById('help-content'));
      }
    });
  });
}

function bindForms() {
  on('form-tx', 'submit', onSubmitTx);
  on('tx-type', 'change', refreshCategoryOptions);
  on('form-profile', 'submit', onSubmitProfile);
  on('form-employee', 'submit', onSubmitEmployee);
  on('btn-export-json', 'click', () => exportReport('json'));
  on('btn-export-md', 'click', () => exportReport('md'));
  on('report-period', 'change', renderReportPreview);
  on('btn-import', 'click', () => document.getElementById('import-file')?.click());
  on('import-file', 'change', onImport);
  on('emp-cancel-edit', 'click', clearEmployeeEdit);
  on('tx-cancel-edit', 'click', clearTxEdit);
  on('form-product', 'submit', onSubmitProduct);
  on('form-product-quick', 'submit', onSubmitProductQuick);
  on('form-cart-line', 'submit', onAddToCart);
  on('btn-finalize-sale', 'click', finalizeSale);
  on('btn-clear-cart', 'click', clearCart);
  on('sale-cancel-edit', 'click', cancelSaleEdit);
  on('mov-payment', 'change', updatePayButtonLabel);
  on('mov-product', 'change', updateCartStockHint);
  on('achat-product', 'change', updateAchatQtyHint);
  on('form-achat', 'submit', onSubmitAchat);
  on('achat-cancel-edit', 'click', clearMovementEdit);
  on('product-cancel-edit', 'click', clearProductEdit);
  on('sale-product-cancel-edit', 'click', clearProductEdit);
  on('product-purchase-unit', 'change', updateProductPackFields);
  on('sale-product-purchase-unit', 'change', updateSaleProductPackFields);
  on('sale-product-unit', 'change', onSaleProductUnitChange);
  on('mov-qty', 'input', updateMovLinePreview);
  on('mov-unit-price', 'input', updateMovLinePreview);
  document.querySelectorAll('[data-action="charger-demo"]').forEach((btn) => {
    btn.addEventListener('click', loadDemo);
  });
  on('btn-sync-catalog', 'click', onSyncCatalog);
  on('btn-reset-all', 'click', onResetAll);
}

const NUMERIC_FIELD_IDS = [
  'tx-amount',
  'mov-qty',
  'mov-unit-price',
  'achat-qty',
  'achat-amount',
  'emp-gross',
  'product-min',
  'sale-product-units-per-purchase',
  'product-units-per-purchase',
];

function applyZeroDefaults() {
  for (const id of NUMERIC_FIELD_IDS) {
    const el = document.getElementById(id);
    if (el?.type === 'number') el.value = '0';
  }
}

function onResetAll() {
  if (
    !confirm(
      'Remettre tout à zéro ?\n\nOpérations, ventes, stock, employés et prêts seront effacés. Les produits par défaut seront recréés sans inventaire.\n\nIrréversible — exportez un JSON avant si besoin.'
    )
  ) {
    return;
  }
  state = resetAppState();
  editingTxId = null;
  editingEmployeeId = null;
  editingProductId = null;
  editingMovementId = null;
  saleCart = [];
  editingSaleNumber = null;
  renderAll();
  applyZeroDefaults();
  switchToPanel('tableau');
  const box = document.getElementById('reset-status');
  if (box) {
    box.innerHTML =
      '<div class="alert alert--ok">Tout remis à zéro — soldes, stock et historique effacés.</div>';
  }
}


function onSubmitProfile(e) {
  e.preventDefault();
  state.profile = {
    ...state.profile,
    businessName: document.getElementById('prof-name').value.trim() || BUSINESS_NAME,
    sellerName: document.getElementById('prof-seller').value.trim(),
    businessAddress: document.getElementById('prof-address').value.trim(),
    businessPhone: document.getElementById('prof-phone').value.trim(),
  };
  saveState(state);
  renderAll();
}



function switchToPanel(name) {
  document.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.panel === name);
  });
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.toggle('is-active', p.id === `panel-${name}`);
  });
}

function exportReport(kind) {
  const period = document.getElementById('report-period').value;
  const stamp = todayISO();
  if (kind === 'json') {
    const json = JSON.stringify(buildReportJson(state, period), null, 2);
    downloadFile(`etat-financier-${period}-${stamp}.json`, json, 'application/json');
  } else {
    const md = buildReportMarkdown(state, period);
    downloadFile(`etat-financier-${period}-${stamp}.md`, md, 'text/markdown');
  }
}

function onImport(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.transactions || data.profile) {
        state = normalizeState(data);
        saveState(state);
        renderAll();
        alert('Sauvegarde importée.');
      }
    } catch {
      alert('Fichier JSON invalide.');
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
}

function lastSundayISO() {
  const d = new Date();
  const diff = d.getDay() === 0 ? 0 : d.getDay();
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function loadDemo() {
  const t = todayISO();
  const sunday = lastSundayISO();
  const y = new Date().getFullYear();
  const products = DEFAULT_PRODUCTS.map((p) => ({
    id: productUid(),
    ...p,
  }));
  const byName = (n) => products.find((p) => p.name === n)?.id;
  const saleId = saleUid();
  const saleIdSun = saleUid();
  const sn = `V-${y}-00001`;
  const snSun = `V-${y}-00002`;
  const soldAt = new Date().toISOString();
  const drinkTotal = 150 + 200;
  const soupTotal = 3000;

  state = {
    profile: {
      ...DEFAULT_PROFILE,
      businessName: 'Manoue Bar',
      sellerName: 'Responsable Manoue Bar',
      businessAddress: 'Haïti',
      saleCounters: { [y]: 2 },
    },
    transactions: [
      {
        id: uid(),
        type: 'rentree',
        date: t,
        amount: drinkTotal,
        category: 'vente',
        label: `Vente boissons ${sn}`,
        saleNumber: sn,
      },
    ],
    employees: [],
    products,
    stockMovements: [
      { id: movementUid(), productId: byName('Soupe giromon (Soup jounou)'), type: 'achat', qty: 40, date: sunday, note: 'Préparation dimanche' },
      { id: movementUid(), productId: byName('Coca-Cola'), type: 'achat', purchaseQty: 2, purchaseUnit: 'caisse', qty: 48, date: t, note: '' },
      { id: movementUid(), productId: byName('Malta H'), type: 'achat', purchaseQty: 1, purchaseUnit: 'caisse', qty: 24, date: t, note: '' },
      { id: movementUid(), productId: byName('7UP'), type: 'achat', purchaseQty: 1, purchaseUnit: 'caisse', qty: 24, date: t, note: '' },
      { id: movementUid(), productId: byName('Aloe'), type: 'achat', purchaseQty: 1, purchaseUnit: 'caisse', qty: 24, date: t, note: '' },
      { id: movementUid(), productId: byName('Kinanm'), type: 'achat', purchaseQty: 1, purchaseUnit: 'caisse', qty: 24, date: t, note: '' },
      { id: movementUid(), productId: byName('Gatorade'), type: 'achat', purchaseQty: 1, purchaseUnit: 'caisse', qty: 24, date: t, note: '' },
      { id: movementUid(), productId: byName('Eau'), type: 'achat', purchaseQty: 3, purchaseUnit: 'caisse', qty: 72, date: t, note: '' },
      { id: movementUid(), productId: byName('Extrait de malt'), type: 'achat', purchaseQty: 1, purchaseUnit: 'caisse', qty: 24, date: t, note: '' },
      {
        id: movementUid(),
        saleId,
        productId: byName('Coca-Cola'),
        type: 'vente',
        qty: 3,
        date: t,
        saleNumber: sn,
        unitPrice: 50,
        lineTotal: 150,
        clientName: 'Client comptoir',
        sellerName: 'Responsable Manoue Bar',
        paymentMethod: 'cash',
        soldAt,
      },
      {
        id: movementUid(),
        saleId,
        productId: byName('Gatorade'),
        type: 'vente',
        qty: 2,
        date: t,
        saleNumber: sn,
        unitPrice: 100,
        lineTotal: 200,
        clientName: 'Client comptoir',
        sellerName: 'Responsable Manoue Bar',
        paymentMethod: 'cash',
        soldAt,
      },
      {
        id: movementUid(),
        saleId: saleIdSun,
        productId: byName('Soupe giromon (Soup jounou)'),
        type: 'vente',
        qty: 12,
        date: sunday,
        saleNumber: snSun,
        unitPrice: 250,
        lineTotal: soupTotal,
        clientName: 'Clients du dimanche',
        sellerName: 'Responsable Manoue Bar',
        paymentMethod: 'pret',
        soldAt: new Date(sunday + 'T12:00:00').toISOString(),
        note: 'Soup jounou — service du dimanche',
      },
    ],
  };
  for (const m of state.stockMovements.filter((x) => x.type === 'achat')) {
    state.transactions.push({
      id: uid(),
      type: 'sortie',
      date: m.date,
      amount: m.date === sunday ? 1200 : 600,
      category: 'achat',
      label: `Achat stock démo — ${state.products.find((p) => p.id === m.productId)?.name || 'produit'}`,
      linkedMovementId: m.id,
      stockLinked: true,
    });
  }
  saveState(state);
  editingTxId = null;
  editingEmployeeId = null;
  editingProductId = null;
  editingMovementId = null;
  saleCart = [];
  editingSaleNumber = null;
  renderAll();
  switchToPanel('recu');
  const box = document.getElementById('demo-status');
  if (box) {
    box.innerHTML =
      '<div class="alert alert--ok">Démo chargée : boissons + vente dimanche (Soupe giromon). Cliquez <strong>Reçu</strong> pour imprimer.</div>';
  }
}

function renderAll() {
  renderKpis();
  renderAlerts();
  renderTransactions();
  renderInsights();
  renderPayroll();
  renderStock();
  renderReceipts();
  renderRecuProducts();
  renderPret();
  renderReportPreview();
  fillProfileForm();
  document.getElementById('tx-date').value = todayISO();
  const movDate = document.getElementById('mov-date');
  if (movDate && !movDate.value) movDate.value = todayISO();
  const achatDate = document.getElementById('achat-date');
  if (achatDate && !achatDate.value) achatDate.value = todayISO();
  refreshProductSelect();
  refreshPaymentSelect();
  refreshMovVenteFields();
  updateAchatQtyHint();
  initProductFormSelects();
  updateProductPackFields();
  renderCart();
  refreshCategoryOptions();
  if (!editingTxId && !editingEmployeeId && !editingProductId && !editingMovementId && !editingSaleNumber) {
    applyZeroDefaults();
  }
}

function refreshMovVenteFields() {
  const seller = document.getElementById('mov-seller');
  if (seller && !seller.value && state.profile.sellerName) {
    seller.value = state.profile.sellerName;
  }
  updateCartStockHint();
  updateMovLinePreview();
}

function updateMovLinePreview() {
  const el = document.getElementById('mov-line-total-preview');
  if (!el) return;
  const total = lineTotal(
    document.getElementById('mov-qty')?.value || 0,
    document.getElementById('mov-unit-price')?.value || 0
  );
  el.textContent = `Total ligne : ${formatMoney(total)}`;
}

function renderKpis() {
  const bal = balanceAt(state.transactions);
  const { from, to } = periodBounds('mois');
  const month = computeTotals(state.transactions, from, to);
  const payroll = totalPayrollCost(payrollSummary(state.employees, state.profile));

  document.getElementById('kpi-balance').textContent = formatMoney(bal);
  document.getElementById('kpi-balance').closest('.kpi')?.classList.toggle('kpi--negative', bal < 0);
  document.getElementById('kpi-month-net').textContent = formatMoney(month.net);
  document.getElementById('kpi-month-in').textContent = formatMoney(month.rentrees);
  document.getElementById('kpi-month-out').textContent = formatMoney(month.sorties);
  document.getElementById('kpi-payroll-net').textContent = formatMoney(payroll.net);
}

function renderAlerts() {
  const bal = balanceAt(state.transactions);
  const alerts = [
    ...scanLedger(state.transactions, bal),
    ...inventoryAlerts(state),
    ...auditStockFinance(state),
  ];
  const el = document.getElementById('alerts-list');
  if (!alerts.length) {
    el.innerHTML = '<li class="alert alert--ok">Aucune alerte critique pour le moment.</li>';
    return;
  }
  el.innerHTML = alerts
    .map(
      (a) =>
        `<li><span class="badge badge--${a.level === 'critique' ? 'critique' : 'avertissement'}">${a.level}</span> ${escapeHtml(a.text)}</li>`
    )
    .join('');
}


function renderInsights() {
  const ideas = generateInsights(state);
  document.getElementById('insights-list').innerHTML = ideas
    .map(
      (i) =>
        `<article class="insight-card"><h4>${escapeHtml(i.title)}</h4><p>${escapeHtml(i.body)}</p></article>`
    )
    .join('');
}


function stockClass(remaining) {
  if (remaining < 0) return 'stock-negative';
  if (remaining === 0) return 'stock-low';
  return 'stock-ok';
}

function refreshPaymentSelect() {
  const sel = document.getElementById('mov-payment');
  if (!sel) return;
  const current = normalizePaymentMethod(sel.value);
  sel.innerHTML = PAYMENT_METHODS.map(
    (p) => `<option value="${p.value}">${escapeHtml(p.label)}</option>`
  ).join('');
  sel.value = current;
  updatePayButtonLabel();
}

function updatePayButtonLabel() {
  const btn = document.getElementById('btn-finalize-sale');
  const method = normalizePaymentMethod(document.getElementById('mov-payment')?.value);
  if (!btn) return;
  btn.textContent = method === 'pret' ? 'Enregistrer le prêt' : 'Payer';
}

function refreshProductSelect(preferProductId) {
  const products = [...(state.products || [])].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'fr')
  );
  const html = !products.length
    ? '<option value="">— Ajoutez un produit (Stock) —</option>'
    : products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  const movSel = document.getElementById('mov-product');
  const achatSel = document.getElementById('achat-product');
  if (movSel) {
    movSel.innerHTML = html;
    if (preferProductId && products.some((p) => p.id === preferProductId)) {
      movSel.value = preferProductId;
    }
  }
  if (achatSel) {
    achatSel.innerHTML = html;
    if (preferProductId && products.some((p) => p.id === preferProductId)) {
      achatSel.value = preferProductId;
    }
  }
}

function onSubmitAchat(e) {
  e.preventDefault();
  const box = document.getElementById('achat-validation');
  const productId = document.getElementById('achat-product').value;
  const product = state.products.find((p) => p.id === productId);
  const productName = product?.name || 'Produit';
  const rawQty = Number(document.getElementById('achat-qty').value);
  const paidAmount = Number(document.getElementById('achat-amount')?.value);
  const movId = editingMovementId || movementUid();
  const mov = buildAchatMovement(product, rawQty, {
    id: movId,
    productId,
    date: document.getElementById('achat-date').value,
    note: document.getElementById('achat-note').value.trim(),
  });
  mov.stockLinked = true;
  const v = validateMovement(mov, state);
  if (!v.ok) {
    box.innerHTML = v.errors.map((err) => `<div class="alert alert--danger">${escapeHtml(err)}</div>`).join('');
    return;
  }
  if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
    box.innerHTML =
      '<div class="alert alert--danger">Indiquez le montant payé au fournisseur — une sortie (Opérations) sera créée automatiquement.</div>';
    return;
  }
  if (editingMovementId) {
    const idx = state.stockMovements.findIndex((m) => m.id === editingMovementId);
    if (idx >= 0) state.stockMovements[idx] = mov;
  } else {
    state.stockMovements.push(mov);
  }
  upsertLinkedAchatSortie(state, mov, paidAmount, productName);
  let okMsg = isBulkPurchaseProduct(product)
    ? `Achat stock : ${mov.purchaseQty} ${purchaseUnitLabel(product)}(s) = ${mov.qty} ${saleUnitLabel(product)}.`
    : `Achat stock : +${mov.qty} ${saleUnitLabel(product)}.`;
  okMsg += ` Sortie ${formatMoney(paidAmount, state.profile.currency)} liée automatiquement.`;
  box.innerHTML = `<div class="alert alert--ok">${escapeHtml(okMsg)}</div>`;
  saveState(state);
  clearMovementEdit();
  document.getElementById('achat-date').value = todayISO();
  renderAll();
}

function startEditMovement(movId) {
  const mov = (state.stockMovements || []).find((m) => m.id === movId && m.type === 'achat');
  if (!mov) return;
  editingMovementId = movId;
  const product = state.products.find((p) => p.id === mov.productId);
  document.getElementById('achat-product').value = mov.productId;
  updateAchatQtyHint();
  const displayQty =
    product && isBulkPurchaseProduct(product)
      ? mov.purchaseQty ?? mov.qty
      : mov.qty;
  document.getElementById('achat-qty').value = displayQty;
  document.getElementById('achat-date').value = mov.date;
  document.getElementById('achat-note').value = mov.note || '';
  const sortie = getLinkedSortie(state, movId);
  document.getElementById('achat-amount').value = sortie ? sortie.amount : '';
  const title = document.getElementById('achat-form-title');
  const submitBtn = document.getElementById('achat-submit-btn');
  const cancelBtn = document.getElementById('achat-cancel-edit');
  if (title) title.textContent = `Modifier l'achat — ${product?.name || 'produit'}`;
  if (submitBtn) submitBtn.textContent = 'Enregistrer (stock + sortie)';
  if (cancelBtn) cancelBtn.hidden = false;
  switchToPanel('stock');
  document.getElementById('form-achat')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearMovementEdit() {
  editingMovementId = null;
  const form = document.getElementById('form-achat');
  if (form) form.reset();
  document.getElementById('achat-date').value = todayISO();
  document.getElementById('achat-qty').value = '0';
  document.getElementById('achat-amount').value = '0';
  const title = document.getElementById('achat-form-title');
  const submitBtn = document.getElementById('achat-submit-btn');
  const cancelBtn = document.getElementById('achat-cancel-edit');
  if (title) title.textContent = 'Entrée stock — achat fournisseur';
  if (submitBtn) submitBtn.textContent = 'Enregistrer l\'achat (stock + sortie auto)';
  if (cancelBtn) cancelBtn.hidden = true;
}

function defaultPurchaseForSaleUnit(unit) {
  if (unit === 'portion') return { purchaseUnit: 'unite', unitsPerPurchase: 1 };
  if (unit === 'gallon') return { purchaseUnit: 'gallon', unitsPerPurchase: 1 };
  if (unit === 'sac') return { purchaseUnit: 'sac', unitsPerPurchase: 1 };
  return { purchaseUnit: 'caisse', unitsPerPurchase: 0 };
}

function productNameExists(name, exceptId) {
  const n = name.trim().toLowerCase();
  return (state.products || []).some(
    (p) => p.id !== exceptId && (p.name || '').trim().toLowerCase() === n
  );
}

function registerProduct(p, { validationId, resetForm, selectProductId = true } = {}) {
  const box = validationId ? document.getElementById(validationId) : null;
  const v = validateProduct(p);
  if (!v.ok) {
    if (box) {
      box.innerHTML = v.errors
        .map((err) => `<div class="alert alert--danger">${escapeHtml(err)}</div>`)
        .join('');
    }
    return null;
  }
  if (productNameExists(p.name, p.id)) {
    if (box) {
      box.innerHTML =
        '<div class="alert alert--danger">Un produit avec ce nom existe déjà dans la liste.</div>';
    }
    return null;
  }
  if (editingProductId) {
    const idx = state.products.findIndex((x) => x.id === editingProductId);
    if (idx >= 0) state.products[idx] = p;
  } else {
    state.products.push(p);
  }
  saveState(state);
  if (resetForm) resetForm();
  renderStock();
  renderRecuProducts();
  if (selectProductId) refreshProductSelect(p.id);
  updateAchatQtyHint();
  updateCartStockHint();
  return p;
}

function readProductFromSaleForm() {
  const unit = document.getElementById('sale-product-unit').value;
  const purchaseUnit = document.getElementById('sale-product-purchase-unit')?.value || 'caisse';
  const unitsPerPurchaseVal =
    purchaseUnit === 'unite'
      ? 1
      : Number(document.getElementById('sale-product-units-per-purchase')?.value) || 1;
  return normalizeProductFields({
    id: editingProductId || productUid(),
    name: document.getElementById('sale-product-name').value.trim(),
    unit,
    purchaseUnit,
    unitsPerPurchase: unitsPerPurchaseVal,
    minStock: 0,
  });
}

function onSubmitProductQuick(e) {
  e.preventDefault();
  const wasEdit = !!editingProductId;
  const p = readProductFromSaleForm();
  const saved = registerProduct(p, {
    validationId: 'sale-product-validation',
    resetForm: clearProductEdit,
  });
  if (!saved) return;
  const box = document.getElementById('sale-product-validation');
  if (box) {
    box.innerHTML = wasEdit
      ? `<div class="alert alert--ok">« ${escapeHtml(saved.name)} » mis à jour dans toute l'application.</div>`
      : `<div class="alert alert--ok">« ${escapeHtml(saved.name)} » ajouté — sélectionné dans la liste. Pensez à un <strong>achat stock</strong> si inventaire vide.</div>`;
  }
  document.getElementById('sale-product-name')?.focus();
}

function onSaleProductUnitChange() {
  if (editingProductId) return;
  const unit = document.getElementById('sale-product-unit')?.value;
  const defaults = defaultPurchaseForSaleUnit(unit);
  const purchSel = document.getElementById('sale-product-purchase-unit');
  const pack = document.getElementById('sale-product-units-per-purchase');
  if (purchSel) purchSel.value = defaults.purchaseUnit;
  if (pack) pack.value = String(defaults.unitsPerPurchase);
  updateSaleProductPackFields();
}

function initProductFormSelects() {
  const unitSel = document.getElementById('product-unit');
  const purchSel = document.getElementById('product-purchase-unit');
  const saleUnitSel = document.getElementById('sale-product-unit');
  const salePurchSel = document.getElementById('sale-product-purchase-unit');
  const unitOptionsHtml = SALE_UNIT_OPTIONS.map(
    (o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`
  ).join('');
  const purchOptionsHtml = PURCHASE_UNIT_OPTIONS.map(
    (o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`
  ).join('');
  if (unitSel && !unitSel.dataset.filled) {
    unitSel.innerHTML = unitOptionsHtml;
    unitSel.dataset.filled = '1';
  }
  if (saleUnitSel && !saleUnitSel.dataset.filled) {
    saleUnitSel.innerHTML = unitOptionsHtml;
    if (!saleUnitSel.value) saleUnitSel.value = 'bouteille';
    saleUnitSel.dataset.filled = '1';
  }
  if (purchSel && !purchSel.dataset.filled) {
    purchSel.innerHTML = purchOptionsHtml;
    purchSel.dataset.filled = '1';
  }
  if (salePurchSel && !salePurchSel.dataset.filled) {
    salePurchSel.innerHTML = purchOptionsHtml;
    if (!salePurchSel.value) salePurchSel.value = 'caisse';
    salePurchSel.dataset.filled = '1';
  }
}

function updateSaleProductPackFields() {
  const pu = document.getElementById('sale-product-purchase-unit')?.value || 'unite';
  const wrap = document.getElementById('sale-product-pack-wrap');
  const lbl = document.getElementById('sale-product-pack-label');
  const bulk = pu !== 'unite';
  if (wrap) wrap.hidden = !bulk;
  if (lbl && bulk) {
    lbl.textContent = `Contenu par ${purchaseUnitLabel({ purchaseUnit: pu })} (unités de vente)`;
  }
}

function fillProductFormsFromProduct(p) {
  const unit = p.unit || 'bouteille';
  const pu = p.purchaseUnit || 'unite';
  const upp = String(unitsPerPurchase(p));
  const min = p.minStock || 0;
  const fields = [
    ['product-name', p.name],
    ['product-unit', unit],
    ['product-purchase-unit', pu],
    ['product-units-per-purchase', upp],
    ['product-min', min],
    ['sale-product-name', p.name],
    ['sale-product-unit', unit],
    ['sale-product-purchase-unit', pu],
    ['sale-product-units-per-purchase', upp],
  ];
  for (const [id, val] of fields) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }
  updateProductPackFields();
  updateSaleProductPackFields();
}

function setProductEditUI(isEdit, panel) {
  const stockTitle = document.getElementById('product-form-title');
  const stockBtn = document.getElementById('product-submit-btn');
  const stockCancel = document.getElementById('product-cancel-edit');
  const saleTitle = document.getElementById('sale-product-form-title');
  const saleBtn = document.getElementById('sale-product-submit-btn');
  const saleCancel = document.getElementById('sale-product-cancel-edit');
  if (stockTitle) stockTitle.textContent = isEdit ? 'Modifier le produit' : 'Nouveau produit';
  if (stockBtn) stockBtn.textContent = isEdit ? 'Enregistrer' : 'Ajouter le produit';
  if (stockCancel) stockCancel.hidden = !isEdit || panel === 'recu';
  if (saleTitle) saleTitle.textContent = isEdit ? 'Modifier le produit' : 'Gestion des produits';
  if (saleBtn) saleBtn.textContent = isEdit ? 'Enregistrer' : 'Ajouter le produit';
  if (saleCancel) saleCancel.hidden = !isEdit || panel === 'stock';
}

function renderRecuProducts() {
  const tbody = document.getElementById('recu-products-body');
  if (!tbody) return;
  const products = [...(state.products || [])].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'fr')
  );
  if (!products.length) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="empty-state">Aucun produit — ajoutez-en un avec le formulaire ci-dessus.</td></tr>';
    return;
  }
  tbody.innerHTML = products
    .map(
      (p) => `<tr>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${escapeHtml(productStockHint(p))}</td>
      <td class="actions-cell">
        <button type="button" class="btn btn--ghost btn-sm" data-recu-edit-prod="${p.id}">Modif.</button>
        <button type="button" class="btn btn--ghost btn-sm" data-recu-del-prod="${p.id}">Suppr.</button>
      </td>
    </tr>`
    )
    .join('');
  tbody.querySelectorAll('[data-recu-edit-prod]').forEach((btn) => {
    btn.addEventListener('click', () => startEditProduct(btn.dataset.recuEditProd, { panel: 'recu' }));
  });
  tbody.querySelectorAll('[data-recu-del-prod]').forEach((btn) => {
    btn.addEventListener('click', () => deleteProduct(btn.dataset.recuDelProd));
  });
}

function updateProductPackFields() {
  const pu = document.getElementById('product-purchase-unit')?.value || 'unite';
  const wrap = document.getElementById('product-pack-wrap');
  const lbl = document.getElementById('product-pack-label');
  const bulk = pu !== 'unite';
  if (wrap) wrap.hidden = !bulk;
  if (lbl && bulk) {
    lbl.textContent = `Contenu par ${purchaseUnitLabel({ purchaseUnit: pu })} (unités de vente)`;
  }
}

function readProductFromForm() {
  const purchaseUnit = document.getElementById('product-purchase-unit').value;
  const unitsPerPurchaseVal =
    purchaseUnit === 'unite'
      ? 1
      : Number(document.getElementById('product-units-per-purchase').value) || 1;
  return normalizeProductFields({
    id: editingProductId || productUid(),
    name: document.getElementById('product-name').value.trim(),
    unit: document.getElementById('product-unit').value,
    purchaseUnit,
    unitsPerPurchase: unitsPerPurchaseVal,
    minStock: Number(document.getElementById('product-min').value) || 0,
  });
}

function onSubmitProduct(e) {
  e.preventDefault();
  const p = readProductFromForm();
  const saved = registerProduct(p, {
    validationId: 'product-validation',
    resetForm: clearProductEdit,
  });
  if (!saved) return;
  const box = document.getElementById('product-validation');
  box.innerHTML = `<div class="alert alert--ok">Produit « ${escapeHtml(saved.name)} » enregistré — visible dans <strong>Reçus / Ventes</strong> et <strong>Achat stock</strong>.</div>`;
  renderAll();
}

function clearProductEdit() {
  editingProductId = null;
  document.getElementById('form-product')?.reset();
  document.getElementById('form-product-quick')?.reset();
  document.getElementById('product-unit').value = 'bouteille';
  document.getElementById('product-purchase-unit').value = 'caisse';
  document.getElementById('product-units-per-purchase').value = '0';
  document.getElementById('product-min').value = '0';
  const saleUnit = document.getElementById('sale-product-unit');
  const salePurch = document.getElementById('sale-product-purchase-unit');
  const salePack = document.getElementById('sale-product-units-per-purchase');
  if (saleUnit) saleUnit.value = 'bouteille';
  if (salePurch) salePurch.value = 'caisse';
  if (salePack) salePack.value = '0';
  setProductEditUI(false);
  updateProductPackFields();
  updateSaleProductPackFields();
}

function deleteProduct(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;
  const msg = [
    `Supprimer « ${product.name} » partout ?`,
    '',
    '• Liste Reçus / Ventes et Achats stock',
    '• Historique achats et ventes de ce produit',
    '• Sorties liées aux achats stock',
    '',
    'Action irréversible.',
  ].join('\n');
  if (!confirm(msg)) return;

  const result = removeProductCompletely(state, productId);
  if (!result.ok) {
    alert(result.errors?.join('\n') || 'Suppression impossible.');
    return;
  }

  markDefaultProductRemoved(state, product.name);
  saleCart = saleCart.filter((l) => l.productId !== productId);
  if (editingProductId === productId) clearProductEdit();
  if (editingSaleNumber) {
    const saleStillExists = (state.stockMovements || []).some(
      (m) => m.type === 'vente' && m.saleNumber === editingSaleNumber
    );
    if (!saleStillExists) clearCart();
    else if (!saleCart.length) clearCart();
  }

  saveState(state);
  renderAll();
}

function startEditProduct(id, { panel = 'stock' } = {}) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  editingProductId = id;
  fillProductFormsFromProduct(p);
  setProductEditUI(true, panel);
  if (panel === 'recu') {
    switchToPanel('recu');
    document.getElementById('form-product-quick')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  switchToPanel('stock');
  document.getElementById('form-product')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function productLabel(productId) {
  return state.products.find((p) => p.id === productId)?.name || 'Produit';
}

function updateAchatQtyHint() {
  const label = document.getElementById('achat-qty-label');
  const hint = document.getElementById('achat-qty-hint');
  const pid = document.getElementById('achat-product')?.value;
  const product = state.products.find((p) => p.id === pid);
  if (!product) return;
  if (isBulkPurchaseProduct(product)) {
    if (label) label.textContent = `Quantité (${purchaseUnitLabel(product)}s)`;
    if (hint) {
      hint.textContent = `1 ${purchaseUnitLabel(product)} = ${unitsPerPurchase(product)} ${saleUnitLabel(product)}. Stock compté en ${saleUnitLabel(product)}.`;
    }
  } else {
    if (label) label.textContent = `Quantité (${saleUnitLabel(product)})`;
    if (hint) hint.textContent = 'Achat et vente dans la même unité.';
  }
}

function updateCartStockHint() {
  const el = document.getElementById('cart-stock-hint');
  const lbl = document.getElementById('mov-qty-label');
  const pid = document.getElementById('mov-product')?.value;
  if (!pid) return;
  const product = state.products.find((p) => p.id === pid);
  const rem = stockRemaining(state, pid, editingSaleNumber);
  if (el) {
    el.textContent = `Stock disponible : ${rem} ${saleUnitLabel(product)} (vente à l'unité)`;
  }
  if (lbl && product) {
    lbl.textContent = `Quantité (${saleUnitLabel(product)})`;
  }
}

function onAddToCart(e) {
  e.preventDefault();
  const box = document.getElementById('mov-validation');
  const line = {
    productId: document.getElementById('mov-product').value,
    qty: Number(document.getElementById('mov-qty').value),
    unitPrice: Number(document.getElementById('mov-unit-price').value),
  };
  const v = validateCartLine(line, state, saleCart, editingSaleNumber);
  if (!v.ok) {
    box.innerHTML = v.errors.map((err) => `<div class="alert alert--danger">${escapeHtml(err)}</div>`).join('');
    return;
  }
  box.innerHTML = '';
  saleCart.push(line);
  document.getElementById('form-cart-line').reset();
  updateCartStockHint();
  renderCart();
}

function removeCartLine(index) {
  saleCart.splice(index, 1);
  renderCart();
}

function renderCart() {
  const tbody = document.getElementById('cart-table-body');
  const totalEl = document.getElementById('cart-total-preview');
  if (!tbody) return;

  if (!saleCart.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="empty-state">Panier vide — ajoutez un ou plusieurs produits.</td></tr>';
  } else {
    tbody.innerHTML = saleCart
      .map((ln, i) => {
        const lt = lineTotal(ln.qty, ln.unitPrice);
        return `<tr>
        <td data-label="Produit">${escapeHtml(productLabel(ln.productId))}</td>
        <td data-label="Qté">${ln.qty}</td>
        <td data-label="Prix">${formatMoney(ln.unitPrice)}</td>
        <td class="amount-pos" data-label="Total">${formatMoney(lt)}</td>
        <td data-label="Actions"><button type="button" class="btn btn--ghost btn-sm" data-rm-cart="${i}">Retirer</button></td>
      </tr>`;
      })
      .join('');
    tbody.querySelectorAll('[data-rm-cart]').forEach((btn) => {
      btn.addEventListener('click', () => removeCartLine(Number(btn.dataset.rmCart)));
    });
  }
  if (totalEl) {
    totalEl.innerHTML = `<strong>Total panier :</strong> ${formatMoney(cartGrandTotal(saleCart))}`;
  }
}

function clearCart() {
  saleCart = [];
  editingSaleNumber = null;
  document.getElementById('sale-cancel-edit')?.setAttribute('hidden', '');
  document.getElementById('sale-form-title').textContent = 'Nouvelle facture / reçu';
  document.getElementById('mov-qty').value = '0';
  document.getElementById('mov-unit-price').value = '0';
  renderCart();
}

function cancelSaleEdit() {
  clearCart();
  document.getElementById('mov-validation').innerHTML = '';
}

function deleteSale(saleNumber) {
  if (!confirm(`Supprimer la vente ${saleNumber} et remettre les produits en stock ?`)) return;
  state.stockMovements = state.stockMovements.filter(
    (m) => !(m.type === 'vente' && m.saleNumber === saleNumber)
  );
  state.transactions = state.transactions.filter((t) => t.saleNumber !== saleNumber);
  saveState(state);
  if (editingSaleNumber === saleNumber) clearCart();
  renderAll();
}

function loadSaleForEdit(saleNumber) {
  const movs = getMovementsForSale(state, saleNumber);
  if (!movs.length) return;
  editingSaleNumber = saleNumber;
  const first = movs[0];
  saleCart = movs.map((m) => ({
    productId: m.productId,
    qty: m.qty,
    unitPrice: m.unitPrice,
  }));
  document.getElementById('mov-date').value = first.date;
  document.getElementById('mov-client').value = first.clientName || '';
  document.getElementById('mov-seller').value = first.sellerName || state.profile.sellerName || '';
  document.getElementById('mov-payment').value = normalizePaymentMethod(first.paymentMethod);
  updatePayButtonLabel();
  document.getElementById('mov-note').value = first.note || '';
  document.getElementById('sale-form-title').textContent = `Modifier la vente ${saleNumber}`;
  document.getElementById('sale-cancel-edit').hidden = false;
  renderCart();
  switchToPanel('recu');
}

function finalizeSale() {
  const box = document.getElementById('mov-validation');
  const buyer = document.getElementById('mov-client').value.trim();
  const v = validateCartCheckout(saleCart, buyer);
  if (!v.ok) {
    box.innerHTML = v.errors.map((err) => `<div class="alert alert--danger">${escapeHtml(err)}</div>`).join('');
    return;
  }

  for (const line of saleCart) {
    const lv = validateCartLine(line, state, [], editingSaleNumber);
    if (!lv.ok) {
      box.innerHTML = lv.errors.map((err) => `<div class="alert alert--danger">${escapeHtml(err)}</div>`).join('');
      return;
    }
  }

  const date = document.getElementById('mov-date').value;
  const sellerName =
    document.getElementById('mov-seller').value.trim() || state.profile.sellerName || '';
  const paymentMethod = document.getElementById('mov-payment').value;
  const note = document.getElementById('mov-note').value.trim();
  const shouldPrint = document.getElementById('mov-print-receipt').checked;

  if (editingSaleNumber) {
    state.stockMovements = state.stockMovements.filter(
      (m) => !(m.type === 'vente' && m.saleNumber === editingSaleNumber)
    );
    state.transactions = state.transactions.filter((t) => t.saleNumber !== editingSaleNumber);
  }

  const saleNumber = editingSaleNumber || nextSaleNumber(state);
  const saleId = saleUid();
  const soldAt = editingSaleNumber
    ? getMovementsForSale(state, editingSaleNumber)[0]?.soldAt || nowISO()
    : nowISO();
  const grandTotal = cartGrandTotal(saleCart);

  for (const line of saleCart) {
    const mov = {
      id: movementUid(),
      saleId,
      saleNumber,
      productId: line.productId,
      type: 'vente',
      qty: line.qty,
      date,
      unitPrice: line.unitPrice,
      lineTotal: lineTotal(line.qty, line.unitPrice),
      clientName: buyer,
      sellerName,
      paymentMethod,
      soldAt,
      note,
      stockLinked: true,
    };
    state.stockMovements.push(mov);
  }

  const rentree = {
    id: uid(),
    type: 'rentree',
    date,
    amount: grandTotal,
    category: inferSaleCategory(state, { lines: saleCart.map((l) => ({ productId: l.productId })) }),
    label: `Vente ${saleNumber} (${saleCart.length} article(s))`,
    approvedLarge: false,
    saleNumber,
    saleId,
    stockLinked: true,
  };
  if (paymentMethod !== 'pret') {
    state.transactions.push(rentree);
  }

  saveState(state);

  const saleGroup = groupSales(state).find((s) => s.saleNumber === saleNumber);
  const nLines = saleGroup?.lines?.length || saleCart.length;
  clearCart();
  renderAll();

  if (shouldPrint && saleGroup) {
    printReceipt(state, saleToReceipt(state, saleGroup));
  }
  const paidMsg =
    paymentMethod === 'pret'
      ? `Prêt enregistré — sortie stock pour ${nLines} produit(s). Rentrée quand le client paie (<strong>Clients en prêt → Encaisser</strong>).`
      : `Payé et enregistré — sortie stock + rentrée ${formatMoney(grandTotal, state.profile.currency)}.${shouldPrint ? ' Reçu imprimé.' : ' (sans reçu papier)'}`;
  box.innerHTML = `<div class="alert alert--ok">Vente ${escapeHtml(saleNumber)} : ${paidMsg}</div>`;
}

function inferSaleCategory(state, sale) {
  for (const ln of sale.lines || []) {
    const p = state.products.find((x) => x.id === ln.productId);
    if (p?.unit === 'portion') return 'repas';
  }
  return 'vente';
}

function onMarkPretPaid(saleNumber) {
  const paidDate = todayISO();
  const result = settlePretSale(state, saleNumber, paidDate, '');
  if (!result.ok) {
    const box = document.getElementById('pret-settle-status');
    if (box) {
      box.innerHTML = result.errors
        .map((e) => `<div class="alert alert--danger">${escapeHtml(e)}</div>`)
        .join('');
    }
    return;
  }
  if (result.needsRentree) {
    const sale = result.sale;
    const rentree = {
      id: uid(),
      type: 'rentree',
      date: result.paidAt,
      amount: result.amount,
      category: inferSaleCategory(state, sale),
      label: `Encaissement prêt — ${saleNumber} — ${sale.clientName}`,
      saleNumber,
      pretSettlement: true,
    };
    state.transactions.push(rentree);
  }
  saveState(state);
  renderAll();
  const box = document.getElementById('pret-settle-status');
  if (box) {
    box.innerHTML = `<div class="alert alert--ok">Prêt encaissé — ${escapeHtml(saleNumber)} (${formatMoney(result.amount, state.profile.currency)}).</div>`;
  }
}

function renderPret() {
  const stats = document.getElementById('pret-stats');
  const clientsBody = document.getElementById('pret-clients-body');
  const openBody = document.getElementById('pret-open-body');
  const paidBody = document.getElementById('pret-paid-body');
  if (!stats) return;

  const open = getOpenPretSales(state);
  const paid = getPaidPretSales(state);
  const byClient = pretByClient(state);
  const total = totalOpenPret(state);
  const cur = state.profile.currency;

  stats.innerHTML = `
    <div class="tax-stat"><div class="tax-stat__label">Total à recevoir</div><div class="tax-stat__value">${formatMoney(total, cur)}</div></div>
    <div class="tax-stat"><div class="tax-stat__label">Clients en prêt</div><div class="tax-stat__value">${byClient.length}</div></div>
    <div class="tax-stat"><div class="tax-stat__label">Ventes en attente</div><div class="tax-stat__value">${open.length}</div></div>
    <div class="tax-stat"><div class="tax-stat__label">Prêts encaissés</div><div class="tax-stat__value">${paid.length}</div></div>
  `;

  if (clientsBody) {
    clientsBody.innerHTML = !byClient.length
      ? '<tr><td colspan="3" class="empty-state">Aucun client en prêt pour le moment.</td></tr>'
      : byClient
          .map(
            (c) => `<tr>
        <td data-label="Client"><strong>${escapeHtml(c.clientName)}</strong></td>
        <td data-label="Ventes en prêt">${c.sales.length}</td>
        <td class="amount-neg" data-label="Total dû">${formatMoney(c.totalOwed, cur)}</td>
      </tr>`
          )
          .join('');
  }

  if (openBody) {
    openBody.innerHTML = !open.length
      ? '<tr><td colspan="6" class="empty-state">Aucune vente en prêt en attente.</td></tr>'
      : open
          .map((s) => {
            const articles = s.lines
              .map((m) => `${escapeHtml(productLabel(m.productId))} ×${m.qty}`)
              .join('<br>');
            return `<tr>
        <td data-label="N° vente"><strong>${escapeHtml(s.saleNumber)}</strong></td>
        <td data-label="Date">${formatDate(s.date)}</td>
        <td data-label="Client">${escapeHtml(s.clientName || '—')}</td>
        <td data-label="Articles">${articles}</td>
        <td class="amount-neg" data-label="Montant">${formatMoney(s.lineTotal, cur)}</td>
        <td class="actions-cell" data-label="Actions">
          <button type="button" class="btn btn--primary btn-sm" data-pret-paid="${escapeHtml(s.saleNumber)}">Encaisser</button>
          <button type="button" class="btn btn--secondary btn-sm" data-print-sale="${escapeHtml(s.saleNumber)}">Reçu</button>
        </td>
      </tr>`;
          })
          .join('');
    openBody.querySelectorAll('[data-pret-paid]').forEach((btn) => {
      btn.addEventListener('click', () => onMarkPretPaid(btn.dataset.pretPaid));
    });
    openBody.querySelectorAll('[data-print-sale]').forEach((btn) => {
      btn.addEventListener('click', () => printReceiptForSale(btn.dataset.printSale));
    });
  }

  if (paidBody) {
    paidBody.innerHTML = !paid.length
      ? '<tr><td colspan="6" class="empty-state">Aucun prêt encaissé pour le moment.</td></tr>'
      : paid
          .map((s) => `<tr>
        <td data-label="N° vente"><strong>${escapeHtml(s.saleNumber)}</strong></td>
        <td data-label="Vente">${formatDate(s.date)}</td>
        <td data-label="Encaissé le">${formatDate(pretPaidDate(s))}</td>
        <td data-label="Client">${escapeHtml(s.clientName || '—')}</td>
        <td class="amount-pos" data-label="Montant">${formatMoney(s.lineTotal, cur)}</td>
        <td class="actions-cell" data-label="Actions">
          <button type="button" class="btn btn--secondary btn-sm" data-print-sale="${escapeHtml(s.saleNumber)}">Reçu</button>
        </td>
      </tr>`)
          .join('');
    paidBody.querySelectorAll('[data-print-sale]').forEach((btn) => {
      btn.addEventListener('click', () => printReceiptForSale(btn.dataset.printSale));
    });
  }
}

function printReceiptForSale(saleNumber) {
  const saleGroup = groupSales(state).find((s) => s.saleNumber === saleNumber);
  if (!saleGroup) return;
  printReceipt(state, saleToReceipt(state, saleGroup));
}

function renderStock() {
  const rows = computeInventory(state);
  const summaryBody = document.getElementById('stock-summary-body');
  if (!rows.length) {
    summaryBody.innerHTML =
      '<tr><td colspan="6" class="empty-state">Aucun produit — ajoutez un produit puis enregistrez achats et ventes.</td></tr>';
  } else {
    summaryBody.innerHTML = rows
      .map((r) => {
        const cls = stockClass(r.remaining);
        const unitHint = productStockHint(r);
        return `<tr>
        <td data-label="Produit"><strong>${escapeHtml(r.name)}</strong></td>
        <td data-label="Unités">${escapeHtml(unitHint)}</td>
        <td data-label="Acheté">${r.bought}</td>
        <td data-label="Vendu">${r.sold}</td>
        <td class="${cls}" data-label="Restant">${r.remaining}</td>
        <td class="actions-cell" data-label="Actions">
          <button type="button" class="btn btn--ghost btn-sm" data-edit-prod="${r.id}">Modif.</button>
          <button type="button" class="btn btn--ghost btn-sm" data-del-prod="${r.id}">Suppr.</button>
        </td>
      </tr>`;
      })
      .join('');
    summaryBody.querySelectorAll('[data-edit-prod]').forEach((btn) => {
      btn.addEventListener('click', () => startEditProduct(btn.dataset.editProd, { panel: 'stock' }));
    });
    summaryBody.querySelectorAll('[data-del-prod]').forEach((btn) => {
      btn.addEventListener('click', () => deleteProduct(btn.dataset.delProd));
    });
  }

  const allMovs = [...(state.stockMovements || [])].sort((a, b) => b.date.localeCompare(a.date));
  const productName = (id) => state.products.find((p) => p.id === id)?.name || '—';
  const productById = (id) => state.products.find((p) => p.id === id);

  const buys = allMovs.filter((m) => m.type === 'achat');

  const buyBody = document.getElementById('stock-buys-body');
  if (!buys.length) {
    buyBody.innerHTML = '<tr><td colspan="5" class="empty-state">Aucun achat enregistré.</td></tr>';
  } else {
    buyBody.innerHTML = buys
      .map(
        (m) => `<tr>
      <td data-label="Date">${formatDate(m.date)}</td>
      <td data-label="Produit">${escapeHtml(productName(m.productId))}</td>
      <td data-label="Achat">${escapeHtml(formatAchatQtyCell(m, productById(m.productId)))}</td>
      <td data-label="Note">${escapeHtml(m.note || '—')}</td>
      <td class="actions-cell" data-label="Actions">
        <button type="button" class="btn btn--ghost btn-sm" data-edit-mov="${m.id}">Modif.</button>
        <button type="button" class="btn btn--ghost btn-sm" data-del-mov="${m.id}">Suppr.</button>
      </td>
    </tr>`
      )
      .join('');
    bindMovementRowActions(buyBody);
  }
}

function renderReceipts() {
  const tbody = document.getElementById('recu-table-body');
  if (!tbody) return;

  const sales = groupSales(state);

  if (!sales.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="empty-state">Aucun reçu — ajoutez des produits au panier ou <strong>Charger démo</strong>.</td></tr>';
    return;
  }

  tbody.innerHTML = sales
    .map((s) => {
      const articles = s.lines
        .map((m) => `${escapeHtml(productLabel(m.productId))} ×${m.qty}`)
        .join('<br>');
      return `<tr>
      <td data-label="N° vente"><strong>${escapeHtml(s.saleNumber)}</strong></td>
      <td data-label="Date">${formatDate(s.date)}</td>
      <td data-label="Vendeur">${escapeHtml(s.sellerName || state.profile.sellerName || '—')}</td>
      <td data-label="Acheteur">${escapeHtml(s.clientName || '—')}</td>
      <td data-label="Paiement">${escapeHtml(paymentLabel(s.paymentMethod))}</td>
      <td data-label="Articles">${articles}</td>
      <td class="amount-pos" data-label="Total">${formatMoney(s.lineTotal)}</td>
      <td class="actions-cell" data-label="Actions">
        <button type="button" class="btn btn--secondary btn-sm" data-print-sale="${escapeHtml(s.saleNumber)}">Reçu</button>
        <button type="button" class="btn btn--ghost btn-sm" data-edit-sale="${escapeHtml(s.saleNumber)}">Modif.</button>
        <button type="button" class="btn btn--ghost btn-sm" data-del-sale="${escapeHtml(s.saleNumber)}">Suppr.</button>
      </td>
    </tr>`;
    })
    .join('');

  tbody.querySelectorAll('[data-print-sale]').forEach((btn) => {
    btn.addEventListener('click', () => printReceiptForSale(btn.dataset.printSale));
  });
  tbody.querySelectorAll('[data-edit-sale]').forEach((btn) => {
    btn.addEventListener('click', () => loadSaleForEdit(btn.dataset.editSale));
  });
  tbody.querySelectorAll('[data-del-sale]').forEach((btn) => {
    btn.addEventListener('click', () => deleteSale(btn.dataset.delSale));
  });
}

function bindMovementRowActions(container) {
  container.querySelectorAll('[data-edit-mov]').forEach((btn) => {
    btn.addEventListener('click', () => startEditMovement(btn.dataset.editMov));
  });
  container.querySelectorAll('[data-del-mov]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('Supprimer cet achat stock et la sortie liée (Opérations) ?')) return;
      if (editingMovementId === btn.dataset.delMov) clearMovementEdit();
      removeAchatMovement(state, btn.dataset.delMov);
      saveState(state);
      renderAll();
    });
  });
}

function renderReportPreview() {
  const period = document.getElementById('report-period')?.value || 'mois';
  const inv = computeInventory(state);
  const stockLines = inv.length
    ? inv
        .map(
          (r) =>
            `| ${r.name} | ${r.bought} | ${r.sold} | ${r.remaining} ${r.unit} |`
        )
        .join('\n')
    : '_Aucun produit._';
  const stockBlock = `## Inventaire produits\n\n| Produit | Acheté | Vendu | Restant |\n|---------|--------|-------|--------|\n${stockLines}`;
  const md = `${buildReportMarkdown(state, period)}\n\n${stockBlock}`;
  document.getElementById('report-preview').textContent = md;
}

function fillProfileForm() {
  const p = state.profile;
  const name = displayBusinessName(p);
  document.getElementById('prof-name').value = name;
  document.getElementById('prof-name').placeholder = BUSINESS_NAME;
  document.getElementById('prof-seller').value = p.sellerName || '';
  document.getElementById('prof-address').value = p.businessAddress || '';
  document.getElementById('prof-phone').value = p.businessPhone || '';
  const h1 = document.getElementById('app-brand-name') || document.querySelector('.app-header h1');
  if (h1) h1.textContent = name;
  document.title = `${name} — État financier`;
  const sub = document.querySelector('.app-header__brand small');
  if (sub) {
    const tag = (p.sundayService || DEFAULT_PROFILE.sundayService).trim();
    sub.textContent = tag.toLowerCase().includes('manoue') ? tag : `${name} · ${tag}`;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', init);
