'use strict';
const STORAGE_KEY = 'etat_financier_v1';

const BUSINESS_NAME = 'Manoue Bar';

const LEGACY_BUSINESS_NAMES = new Set([
  'Manoue Dépôt',
  'Manoue Depot',
  'État financier',
  'Etat financier',
  'Entreprise',
]);

const DEFAULT_PROFILE = {
  businessName: BUSINESS_NAME,
  businessAddress: 'Haïti',
  businessPhone: '',
  sellerName: '',
  sundayService: 'Repas chaque dimanche — Soupe giromon (Soup jounou)',
  country: 'HT',
  currency: 'HTG',
  fiscalYearStart: '01-01',
  saleCounters: {},
  tpsRate: 0,
  tvqRate: 0,
  payrollFederalRate: 0,
  payrollProvincialRate: 0,
  cppRate: 0,
  eiRate: 0,
  qppRate: 0,
};

const DEFAULT_PRODUCTS = [
  { name: 'Coca-Cola', unit: 'bouteille', purchaseUnit: 'caisse', unitsPerPurchase: 24, bottlesPerCase: 24, minStock: 0 },
  { name: 'Malta H', unit: 'bouteille', purchaseUnit: 'caisse', unitsPerPurchase: 24, bottlesPerCase: 24, minStock: 0 },
  { name: '7UP', unit: 'bouteille', purchaseUnit: 'caisse', unitsPerPurchase: 24, bottlesPerCase: 24, minStock: 0 },
  { name: 'Aloe', unit: 'bouteille', purchaseUnit: 'caisse', unitsPerPurchase: 24, bottlesPerCase: 24, minStock: 0 },
  { name: 'Kinanm', unit: 'bouteille', purchaseUnit: 'caisse', unitsPerPurchase: 24, bottlesPerCase: 24, minStock: 0 },
  { name: 'Gatorade', unit: 'bouteille', purchaseUnit: 'caisse', unitsPerPurchase: 24, bottlesPerCase: 24, minStock: 0 },
  { name: 'Eau', unit: 'bouteille', purchaseUnit: 'caisse', unitsPerPurchase: 24, bottlesPerCase: 24, minStock: 0 },
  { name: 'Extrait de malt', unit: 'bouteille', purchaseUnit: 'caisse', unitsPerPurchase: 24, bottlesPerCase: 24, minStock: 0 },
  { name: 'Soupe giromon (Soup jounou)', unit: 'portion', purchaseUnit: 'unite', unitsPerPurchase: 1, minStock: 0 },
];

const LEGACY_PRODUCT_NAMES = new Set([
  'Rhum Barbancourt — grand format',
  'Rhum Barbancourt — petit format',
  'Cola Couronne',
  'Vin',
  'Prestige',
  'Fanta',
  'Repas du dimanche',
  'Peinture latex blanc',
  'Rouleau premium',
]);

function normalizeProductFields(p) {
  const purchaseUnit = p.purchaseUnit || 'unite';
  const units =
    purchaseUnit === 'unite' ? 1 : Number(p.unitsPerPurchase ?? p.bottlesPerCase) || 1;
  return {
    ...p,
    unit: p.unit || 'unité',
    purchaseUnit,
    unitsPerPurchase: units,
    bottlesPerCase: purchaseUnit === 'caisse' ? units : p.bottlesPerCase,
  };
}

function syncProductCatalog(state) {
  const defaultByName = new Map(DEFAULT_PRODUCTS.map((p) => [p.name, p]));
  const kept = [];
  const keptIds = new Set();
  const seen = new Set();
  const removedNames = [];

  for (const p of state.products || []) {
    if (LEGACY_PRODUCT_NAMES.has(p.name)) {
      removedNames.push(p.name);
      continue;
    }
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    const def = defaultByName.get(p.name);
    const merged = def
      ? normalizeProductFields({
          ...p,
          unit: def.unit,
          minStock: def.minStock ?? p.minStock,
          purchaseUnit: def.purchaseUnit ?? p.purchaseUnit,
          unitsPerPurchase: def.unitsPerPurchase ?? def.bottlesPerCase ?? p.unitsPerPurchase,
          bottlesPerCase: def.bottlesPerCase ?? p.bottlesPerCase,
        })
      : normalizeProductFields(p);
    kept.push(merged);
    keptIds.add(p.id);
  }

  for (const def of DEFAULT_PRODUCTS) {
    if (seen.has(def.name)) continue;
    if ((state.profile?.ownerRemovedProductNames || []).includes(def.name)) continue;
    const id = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    kept.push(normalizeProductFields({ id, ...def }));
    keptIds.add(id);
    seen.add(def.name);
  }

  state.products = kept;
  state.stockMovements = (state.stockMovements || []).filter(
    (m) => !m.productId || keptIds.has(m.productId)
  );

  return { removedCount: removedNames.length, removedNames };
}

/** Empêche le réajout automatique d'un produit par défaut supprimé par le propriétaire. */
function markDefaultProductRemoved(state, productName) {
  const name = String(productName || '').trim();
  if (!name || !DEFAULT_PRODUCTS.some((d) => d.name === name)) return;
  if (!state.profile.ownerRemovedProductNames) state.profile.ownerRemovedProductNames = [];
  if (!state.profile.ownerRemovedProductNames.includes(name)) {
    state.profile.ownerRemovedProductNames.push(name);
  }
}

let lastCatalogPurge = null;

function getLastCatalogPurge() {
  return lastCatalogPurge;
}

/** Nom affiché partout (en-tête, reçus, rapports) — jamais vide. */
function displayBusinessName(profile) {
  const trimmed = String(profile?.businessName || '').trim();
  if (!trimmed || LEGACY_BUSINESS_NAMES.has(trimmed)) return BUSINESS_NAME;
  return trimmed;
}

function normalizeProfile(profile = {}) {
  const p = { ...DEFAULT_PROFILE, ...profile };
  p.businessName = displayBusinessName(p);
  p.tpsRate = 0;
  p.tvqRate = 0;
  if (!Array.isArray(p.ownerRemovedProductNames)) {
    p.ownerRemovedProductNames = [];
  }
  return p;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let profileMigrated = false;
    const state = raw
      ? (() => {
          const parsed = JSON.parse(raw);
          const before = String(parsed.profile?.businessName || '').trim();
          const normalized = normalizeState(parsed);
          profileMigrated = displayBusinessName({ businessName: before }) !== normalized.profile.businessName;
          return normalized;
        })()
      : createEmptyState();
    const countBefore = (state.products || []).length;
    const purge = syncProductCatalog(state);
    if (purge.removedCount > 0) {
      lastCatalogPurge = purge;
    } else {
      lastCatalogPurge = null;
    }
    if (profileMigrated || purge.removedCount > 0 || countBefore !== state.products.length) {
      saveState(state);
    }
    return state;
  } catch {
    const state = createEmptyState();
    syncProductCatalog(state);
    return state;
  }
}

function saveState(state) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Efface opérations, ventes, stock et employés — produits par défaut recréés, soldes à 0. */
function resetAppState() {
  const state = createEmptyState();
  syncProductCatalog(state);
  saveState(state);
  return state;
}

function createEmptyState() {
  return {
    profile: { ...DEFAULT_PROFILE },
    transactions: [],
    employees: [],
    products: [],
    stockMovements: [],
    updatedAt: null,
  };
}

function normalizeState(data) {
  const base = createEmptyState();
  const profile = normalizeProfile({ ...base.profile, ...(data.profile || {}) });
  return {
    profile,
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    employees: Array.isArray(data.employees) ? data.employees : [],
    products: Array.isArray(data.products) ? data.products : [],
    stockMovements: Array.isArray(data.stockMovements) ? data.stockMovements : [],
    updatedAt: data.updatedAt || null,
  };
}

function uid() {
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatMoney(n, currency) {
  const cur = currency || 'HTG';
  try {
    return new Intl.NumberFormat('fr-HT', {
      style: 'currency',
      currency: cur,
    }).format(n || 0);
  } catch {
    return `${Number(n || 0).toFixed(2)} Gdes`;
  }
}

function moneyForState(state, n) {
  return formatMoney(n, state?.profile?.currency);
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('fr-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}


/**
 * Valide une transaction avant enregistrement.
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
function validateTransaction(tx, allTransactions, projectedBalance) {
  const errors = [];
  const warnings = [];

  if (!tx.type || !['rentree', 'sortie'].includes(tx.type)) {
    errors.push('Le type doit être « rentrée » ou « sortie ».');
  }

  const amount = Number(tx.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push('Le montant doit être un nombre positif.');
  }

  if (!tx.date) {
    errors.push('La date est obligatoire.');
  } else if (tx.date > todayISO()) {
    errors.push('La date ne peut pas être dans le futur.');
  }

  if (!tx.category || !String(tx.category).trim()) {
    errors.push('Choisissez une catégorie pour classer l\'opération.');
  }

  if (!tx.label || !String(tx.label).trim()) {
    errors.push('Ajoutez une description courte (libellé).');
  }

  const duplicate = findDuplicate(tx, allTransactions);
  if (duplicate) {
    warnings.push(
      `Doublon possible : une opération similaire existe déjà (${duplicate.label}, ${duplicate.amount}$).`
    );
  }

  if (tx.type === 'sortie' && projectedBalance < 0) {
    errors.push(
      `Cette sortie ferait passer le solde à ${projectedBalance.toFixed(2)} $. Opération bloquée.`
    );
  }

  if (tx.type === 'sortie' && amount > 5000 && !tx.approvedLarge) {
    warnings.push('Sortie importante (> 5 000 $) : vérifiez la facture et cochez la confirmation.');
  }

  if (
    tx.type === 'rentree' &&
    (tx.category === 'vente' || tx.category === 'repas') &&
    !tx.saleNumber &&
    !tx.pretSettlement
  ) {
    errors.push(
      'Pour une vente produit, utilisez l\'onglet Reçus / Ventes — le stock et la rentrée seront liés automatiquement.'
    );
  }

  if (tx.type === 'sortie' && tx.category === 'achat' && !tx.linkedMovementId && !tx.stockLinked) {
    errors.push(
      'Les achats marchandise passent par Produits/Stock → Achat : le stock et la sortie seront liés automatiquement.'
    );
  }

  if (tx.linkedMovementId || tx.stockLinked) {
    errors.push(
      'Cette sortie est liée à un achat stock — modifiez-la via Produits/Stock → Entrée stock.'
    );
  }

  if (
    tx.type === 'rentree' &&
    tx.saleNumber &&
    !tx.pretSettlement
  ) {
    errors.push(
      'Cette rentrée est liée à une vente — modifiez via Reçus / Ventes.'
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

function findDuplicate(tx, allTransactions) {
  const amount = Number(tx.amount);
  return allTransactions.find((t) => {
    if (tx.id && t.id === tx.id) return false;
    return (
      t.date === tx.date &&
      t.type === tx.type &&
      Math.abs(Number(t.amount) - amount) < 0.01 &&
      t.category === tx.category
    );
  });
}

function validateEmployee(emp) {
  const errors = [];
  const gross = Number(emp.grossSalary);
  if (!emp.name?.trim()) errors.push('Nom de l\'employé requis.');
  if (!Number.isFinite(gross) || gross <= 0) errors.push('Salaire brut mensuel invalide.');
  return { ok: errors.length === 0, errors };
}

function scanLedger(transactions, balance) {
  const alerts = [];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const monthTx = transactions.filter((t) => t.date >= monthStart);
  const rentrees = monthTx.filter((t) => t.type === 'rentree').reduce((s, t) => s + Number(t.amount), 0);
  const sorties = monthTx.filter((t) => t.type === 'sortie').reduce((s, t) => s + Number(t.amount), 0);

  if (balance < 0) {
    alerts.push({ level: 'critique', text: 'Solde cumulé négatif : risque de trésorerie.' });
  }

  if (sorties > rentrees && rentrees > 0) {
    alerts.push({
      level: 'avertissement',
      text: 'Ce mois, les sorties dépassent les rentrées — marge négative.',
    });
  }

  const uncategorized = transactions.filter((t) => !t.category);
  if (uncategorized.length) {
    alerts.push({
      level: 'avertissement',
      text: `${uncategorized.length} opération(s) sans catégorie à corriger.`,
    });
  }

  return alerts;
}


function computeTotals(transactions, fromDate, toDate) {
  const filtered = transactions.filter((t) => {
    if (fromDate && t.date < fromDate) return false;
    if (toDate && t.date > toDate) return false;
    return true;
  });

  const rentrees = filtered
    .filter((t) => t.type === 'rentree')
    .reduce((s, t) => s + Number(t.amount), 0);
  const sorties = filtered
    .filter((t) => t.type === 'sortie')
    .reduce((s, t) => s + Number(t.amount), 0);

  return {
    rentrees,
    sorties,
    net: rentrees - sorties,
    count: filtered.length,
    items: filtered.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

function balanceAt(transactions) {
  return transactions.reduce((bal, t) => {
    const n = Number(t.amount);
    return t.type === 'rentree' ? bal + n : bal - n;
  }, 0);
}

function periodBounds(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  if (period === 'jour') {
    const iso = now.toISOString().slice(0, 10);
    return { from: iso, to: iso, label: 'Journalier' };
  }

  if (period === 'mois') {
    const from = new Date(y, m, 1).toISOString().slice(0, 10);
    const to = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    return { from, to, label: 'Mensuel' };
  }

  const from = `${y}-01-01`;
  const to = now.toISOString().slice(0, 10);
  return { from, to, label: 'Annuel' };
}

function buildReportJson(state, period) {
  const { from, to, label } = periodBounds(period);
  const totals = computeTotals(state.transactions, from, to);

  return {
    meta: {
      app: 'État financier',
      generatedAt: new Date().toISOString(),
      period: label,
      from,
      to,
      business: displayBusinessName(state.profile),
    },
    resume: {
      rentrees: totals.rentrees,
      sorties: totals.sorties,
      net: totals.net,
      soldeCumule: balanceAt(state.transactions),
      operations: totals.count,
    },
    transactions: totals.items.map((t) => ({
      date: t.date,
      type: t.type,
      category: t.category,
      label: t.label,
      amount: Number(t.amount),
    })),
  };
}

function buildReportMarkdown(state, period) {
  const data = buildReportJson(state, period);
  const lines = [
    `# Rapport ${data.meta.period} — ${data.meta.business}`,
    ``,
    `Période : **${data.meta.from}** → **${data.meta.to}**`,
    `Généré : ${new Date(data.meta.generatedAt).toLocaleString('fr-CA')}`,
    ``,
    `## Résumé`,
    ``,
    `| Indicateur | Montant |`,
    `|------------|---------|`,
    `| Rentrées | ${formatMoney(data.resume.rentrees)} |`,
    `| Sorties | ${formatMoney(data.resume.sorties)} |`,
    `| Résultat net (période) | ${formatMoney(data.resume.net)} |`,
    `| Solde cumulé | ${formatMoney(data.resume.soldeCumule)} |`,
    `| Opérations | ${data.resume.operations} |`,
    ``,
    `## Détail des opérations`,
    ``,
  ];

  if (!data.transactions.length) {
    lines.push(`_Aucune opération sur cette période._`);
  } else {
    lines.push(`| Date | Type | Catégorie | Libellé | Montant |`);
    lines.push(`|------|------|-----------|---------|---------|`);
    for (const t of data.transactions) {
      const sign = t.type === 'rentree' ? '+' : '−';
      lines.push(
        `| ${t.date} | ${t.type} | ${t.category} | ${t.label} | ${sign}${formatMoney(t.amount)} |`
      );
    }
  }

  lines.push(``, `---`, `*Rapport État financier — à valider avec votre comptable.*`);
  return lines.join('\n');
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Estimation simplifiée paie Québec (à valider avec comptable).
 */
function computePayroll(employee, profile) {
  const gross = Number(employee.grossSalary) || 0;
  const federal = gross * (profile.payrollFederalRate || 0.15);
  const provincial = gross * (profile.payrollProvincialRate || 0.14);
  const cpp = Math.min(gross * (profile.cppRate || 0.0595), gross * 0.0595);
  const ei = gross * (profile.eiRate || 0.0163);
  const qpp = gross * (profile.qppRate || 0.064);
  const deductions = federal + provincial + cpp + ei + qpp;
  const net = Math.max(0, gross - deductions);

  return {
    gross,
    federal,
    provincial,
    cpp,
    ei,
    qpp,
    deductions,
    net,
    employerCost: gross + ei * 1.4,
  };
}

function payrollSummary(employees, profile) {
  return employees.map((emp) => ({
    id: emp.id,
    name: emp.name,
    role: emp.role || '—',
    ...computePayroll(emp, profile),
  }));
}

function totalPayrollCost(rows) {
  return rows.reduce(
    (acc, r) => ({
      gross: acc.gross + r.gross,
      net: acc.net + r.net,
      deductions: acc.deductions + r.deductions,
      employerCost: acc.employerCost + r.employerCost,
    }),
    { gross: 0, net: 0, deductions: 0, employerCost: 0 }
  );
}


/**
 * Recommandations pédagogiques pour le responsable.
 */
function generateInsights(state) {
  const { from, to } = periodBounds('mois');
  const month = computeTotals(state.transactions, from, to);
  const prevFrom = shiftMonth(from, -1);
  const prevTo = shiftMonth(to, -1);
  const prev = computeTotals(state.transactions, prevFrom, prevTo);

  const ideas = [];

  if (new Date().getDay() === 0) {
    ideas.push({
      title: 'Dimanche — Soupe giromon',
      body: 'Enregistrez les portions de Soup jounou vendues dans Reçus / Ventes (produit « Soupe giromon »).',
      priority: 'haute',
    });
  }

  if (month.net < 0) {
    ideas.push({
      title: 'Marge mensuelle négative',
      body: `Les sorties (${formatMoney(month.sorties)}) dépassent les rentrées (${formatMoney(month.rentrees)}). Identifiez 2 postes de dépenses à réduire ou relancez les ventes cette semaine.`,
      priority: 'haute',
    });
  }

  if (month.rentrees > 0 && prev.rentrees > 0) {
    const growth = ((month.rentrees - prev.rentrees) / prev.rentrees) * 100;
    if (growth < -10) {
      ideas.push({
        title: 'Baisse des ventes',
        body: `Les rentrées ont chuté d'environ ${Math.abs(growth).toFixed(0)} % vs le mois précédent. Analysez le marché local et vos prix.`,
        priority: 'moyenne',
      });
    } else if (growth > 15) {
      ideas.push({
        title: 'Croissance des rentrées',
        body: `+${growth.toFixed(0)} % de rentrées vs le mois dernier — bon moment pour réinvestir prudemment (équipement, formation).`,
        priority: 'positive',
      });
    }
  }

  const achats = month.items.filter((t) => t.type === 'sortie' && t.category === 'achat');
  const ventes = month.items.filter(
    (t) => t.type === 'rentree' && (t.category === 'vente' || t.category === 'repas')
  );
  if (achats.length > ventes.length * 2 && ventes.length > 0) {
    ideas.push({
      title: 'Achats vs ventes',
      body: 'Beaucoup d\'achats par rapport aux ventes enregistrées — vérifiez les stocks et les délais de paiement fournisseurs.',
      priority: 'moyenne',
    });
  }

  if (!state.employees.length && month.sorties > 3000) {
    ideas.push({
      title: 'Paie non modélisée',
      body: 'Aucun employé enregistré alors que les sorties sont élevées. Ajoutez la paie pour estimer le revenu net réel après impôts et cotisations.',
      priority: 'moyenne',
    });
  }

  const sansTaxe = month.items.filter(
    (t) =>
      t.type === 'rentree' &&
      (t.category === 'vente' || t.category === 'repas') &&
      !t.tpsIncluded &&
      !t.taxExempt
  );
  if (sansTaxe.length) {
    ideas.push({
      title: 'Taxe 7 %',
      body: `${sansTaxe.length} vente(s) sans taxe indiquée — vérifiez vos reçus Manoue Bar.`,
      priority: 'haute',
    });
  }

  const pretSales = new Set(
    (state.stockMovements || [])
      .filter(
        (m) =>
          m.type === 'vente' &&
          (m.paymentMethod === 'pret' || m.paymentMethod === 'credit') &&
          m.date >= from &&
          m.date <= to
      )
      .map((m) => m.saleNumber)
  );
  if (pretSales.size > 0) {
    ideas.push({
      title: 'Ventes en prêt',
      body: `${pretSales.size} vente(s) en prêt ce mois — voir l'onglet Clients en prêt pour encaisser.`,
      priority: 'moyenne',
    });
  }

  if (!ideas.length) {
    ideas.push({
      title: 'Situation stable',
      body: 'Aucune alerte majeure ce mois. Continuez à saisir chaque rentrée et sortie le jour même pour éviter les erreurs.',
      priority: 'positive',
    });
  }

  return ideas;
}

function shiftMonth(iso, delta) {
  const d = new Date(iso + 'T12:00:00');
  d.setMonth(d.getMonth() + delta);
  return d.toISOString().slice(0, 10);
}

const PURCHASE_UNIT_OPTIONS = [
  { value: 'unite', label: 'Unité (même à l\'achat et à la vente)' },
  { value: 'caisse', label: 'Caisse' },
  { value: 'sac', label: 'Sac' },
  { value: 'gallon', label: 'Gallon' },
];

const SALE_UNIT_OPTIONS = [
  { value: 'bouteille', label: 'Bouteille' },
  { value: 'unite', label: 'Unité' },
  { value: 'portion', label: 'Portion' },
  { value: 'gallon', label: 'Gallon' },
  { value: 'sac', label: 'Sac' },
];

function productUid() {
  return `prod-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function movementUid() {
  return `mov-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function unitsPerPurchase(p) {
  const n = Number(p?.unitsPerPurchase ?? p?.bottlesPerCase);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function purchaseUnitLabel(p) {
  const map = { caisse: 'caisse', sac: 'sac', gallon: 'gallon', unite: 'unité' };
  return map[p?.purchaseUnit] || p?.purchaseUnit || 'unité';
}

function isBulkPurchaseProduct(p) {
  const pu = p?.purchaseUnit;
  return !!pu && pu !== 'unite';
}

/** @deprecated */
function isCasePurchaseProduct(p) {
  return isBulkPurchaseProduct(p);
}

function saleUnitLabel(p) {
  return p?.unit || 'unité';
}

function productStockHint(p) {
  if (isBulkPurchaseProduct(p)) {
    return `${saleUnitLabel(p)} (achat : ${purchaseUnitLabel(p)} de ${unitsPerPurchase(p)})`;
  }
  return saleUnitLabel(p);
}

function normalizeProductFields(p) {
  const purchaseUnit = p.purchaseUnit || 'unite';
  const units = purchaseUnit === 'unite' ? 1 : unitsPerPurchase(p);
  return {
    ...p,
    unit: p.unit || 'unité',
    purchaseUnit,
    unitsPerPurchase: units,
    bottlesPerCase: purchaseUnit === 'caisse' ? units : p.bottlesPerCase,
  };
}

/** Quantité normalisée en unité de vente. */
function movementBaseQty(m, product) {
  if (m.type === 'achat' && isBulkPurchaseProduct(product)) {
    if (m.purchaseQty != null) {
      return Number(m.purchaseQty) * unitsPerPurchase(product);
    }
    return Number(m.qty || 0);
  }
  return Number(m.qty || 0);
}

function formatAchatQtyCell(m, product) {
  if (isBulkPurchaseProduct(product)) {
    const per = unitsPerPurchase(product);
    const packs =
      m.purchaseQty != null ? Number(m.purchaseQty) : Number(m.qty || 0) / per;
    const units = Number(m.qty) || packs * per;
    return `${packs} ${purchaseUnitLabel(product)}(s) → ${units} ${saleUnitLabel(product)}`;
  }
  return `+${m.qty} ${saleUnitLabel(product)}`;
}

function buildAchatMovement(product, rawQty, fields) {
  const mov = { ...fields, type: 'achat' };
  if (isBulkPurchaseProduct(product)) {
    const packs = Number(rawQty);
    mov.purchaseQty = packs;
    mov.purchaseUnit = product.purchaseUnit;
    mov.qty = packs * unitsPerPurchase(product);
  } else {
    mov.qty = Number(rawQty);
  }
  return mov;
}

function computeInventory(state) {
  const products = state.products || [];
  const movements = state.stockMovements || [];

  return products.map((p) => {
    const movs = movements.filter((m) => m.productId === p.id);
    const bought = movs
      .filter((m) => m.type === 'achat')
      .reduce((s, m) => s + movementBaseQty(m, p), 0);
    const sold = movs
      .filter((m) => m.type === 'vente')
      .reduce((s, m) => s + Number(m.qty || 0), 0);
    const remaining = bought - sold;
    const buyMovs = movs.filter((m) => m.type === 'achat').sort((a, b) => b.date.localeCompare(a.date));
    const sellMovs = movs.filter((m) => m.type === 'vente').sort((a, b) => b.date.localeCompare(a.date));

    return {
      ...p,
      bought,
      sold,
      remaining,
      buyMovs,
      sellMovs,
      lowStock: remaining <= (p.minStock || 0),
    };
  });
}

function validateProduct(p) {
  const errors = [];
  if (!p.name?.trim()) errors.push('Nom du produit requis.');
  if (!p.unit?.trim()) errors.push('Unité de vente requise.');
  if (isBulkPurchaseProduct(p) && unitsPerPurchase(p) < 1) {
    errors.push('Indiquez combien d\'unités de vente contient chaque achat (caisse, sac, gallon…).');
  }
  return { ok: errors.length === 0, errors };
}

function validateMovement(mov, state) {
  const errors = [];
  const product = (state.products || []).find((pr) => pr.id === mov.productId);
  const qty =
    mov.type === 'achat' && isBulkPurchaseProduct(product)
      ? Number(mov.purchaseQty ?? mov.qty)
      : Number(mov.qty);
  if (!mov.productId) errors.push('Choisissez un produit.');
  if (!Number.isFinite(qty) || qty <= 0) errors.push('Quantité invalide.');
  if (!mov.date) errors.push('Date requise.');
  if (mov.type === 'vente') {
    const price = Number(mov.unitPrice);
    if (!Number.isFinite(price) || price < 0) {
      errors.push('Indiquez un prix unitaire pour la vente (reçu).');
    }
    if (!mov.clientName?.trim() && !mov.buyerName?.trim()) {
      errors.push('Le nom de l\'acheteur est obligatoire sur le reçu.');
    }
  }
  if (mov.type === 'vente' && mov.productId) {
    const inv = computeInventory(state);
    const row = inv.find((x) => x.id === mov.productId);
    const excludeQty =
      mov.id && state.stockMovements
        ? Number(
            state.stockMovements.find((x) => x.id === mov.id && x.type === 'vente')?.qty || 0
          )
        : 0;
    const available = (row?.remaining || 0) + excludeQty;
    const saleQty = Number(mov.qty);
    if (row && saleQty > available) {
      errors.push(
        `Stock insuffisant : il reste ${available} ${saleUnitLabel(row)}, vous vendez ${saleQty}.`
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

function inventoryAlerts(state) {
  const rows = computeInventory(state);
  const alerts = [];
  for (const r of rows) {
    const unit = saleUnitLabel(r);
    if (r.remaining < 0) {
      alerts.push({
        level: 'critique',
        text: `${r.name} : stock négatif (${r.remaining} ${unit}) — corrigez les quantités.`,
      });
    } else if (r.lowStock && r.remaining >= 0) {
      alerts.push({
        level: 'avertissement',
        text: `${r.name} : stock bas (${r.remaining} ${unit} restant).`,
      });
    }
  }
  return alerts;
}

/**
 * Supprime un produit du catalogue et purge stock, ventes et opérations liées.
 * @returns {{ ok: boolean, productName?: string, errors?: string[] }}
 */
function removeProductCompletely(state, productId) {
  const product = (state.products || []).find((p) => p.id === productId);
  if (!product) return { ok: false, errors: ['Produit introuvable.'] };

  const removedMovIds = new Set();
  const affectedSaleNumbers = new Set();

  for (const m of state.stockMovements || []) {
    if (m.productId !== productId) continue;
    removedMovIds.add(m.id);
    if (m.type === 'vente' && m.saleNumber) affectedSaleNumbers.add(m.saleNumber);
  }

  state.stockMovements = (state.stockMovements || []).filter((m) => m.productId !== productId);

  state.transactions = (state.transactions || []).filter((t) => {
    if (t.linkedMovementId && removedMovIds.has(t.linkedMovementId)) return false;
    return true;
  });

  for (const saleNumber of affectedSaleNumbers) {
    const remaining = (state.stockMovements || []).filter(
      (m) => m.type === 'vente' && m.saleNumber === saleNumber
    );
    if (!remaining.length) {
      state.transactions = state.transactions.filter((t) => t.saleNumber !== saleNumber);
      continue;
    }
    const newTotal = remaining.reduce((s, m) => s + (Number(m.lineTotal) || 0), 0);
    for (const t of state.transactions) {
      if (t.saleNumber === saleNumber) t.amount = newTotal;
    }
  }

  state.products = state.products.filter((p) => p.id !== productId);
  return { ok: true, productName: product.name };
}


const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'pret', label: 'Prêt (crédit)' },
];

const PAYMENT_LABELS = {
  cash: 'Cash',
  pret: 'Prêt',
  comptant: 'Cash',
};

function paymentLabel(value) {
  if (PAYMENT_LABELS[value]) return PAYMENT_LABELS[value];
  return PAYMENT_METHODS.find((p) => p.value === value)?.label || value || '—';
}

function normalizePaymentMethod(value) {
  if (value === 'comptant' || value === 'cash') return 'cash';
  if (value === 'pret') return 'pret';
  return 'cash';
}

function nextSaleNumber(state) {
  const year = new Date().getFullYear();
  if (!state.profile.saleCounters) state.profile.saleCounters = {};
  const n = (state.profile.saleCounters[year] || 0) + 1;
  state.profile.saleCounters[year] = n;
  return `V-${year}-${String(n).padStart(5, '0')}`;
}

function lineTotal(qty, unitPrice) {
  return Math.round(Number(qty) * Number(unitPrice) * 100) / 100;
}

function computeReceiptTotals(subtotal) {
  const total = Math.round(Number(subtotal) * 100) / 100;
  return { subtotal: total, total };
}

function metaRow(label, value) {
  if (!value) return '';
  return `<tr><td class="meta-label">${escapeHtml(label)}</td><td class="meta-value">${escapeHtml(value)}</td></tr>`;
}

function linesTableHtml(lines) {
  return lines
    .map(
      (ln) => `<tr>
          <td>${escapeHtml(ln.productName)}</td>
          <td class="num">${ln.qty} ${escapeHtml(ln.unit || '')}</td>
          <td class="num">${formatMoney(ln.unitPrice)}</td>
          <td class="num">${formatMoney(ln.lineTotal)}</td>
        </tr>`
    )
    .join('');
}

function buildReceiptHtml(state, sale) {
  const p = state.profile;
  const business = displayBusinessName(p);
  const seller = sale.sellerName || p.sellerName || '—';
  const buyer = sale.buyerName || sale.clientName || '—';
  const lines = sale.lines && sale.lines.length ? sale.lines : [sale];
  const grandTotal =
    sale.lineTotal ?? lines.reduce((s, ln) => s + (ln.lineTotal || 0), 0);
  const totals = computeReceiptTotals(grandTotal);
  const saleDate = sale.soldAt ? formatDateTime(sale.soldAt) : formatDate(sale.date);
  const payment = paymentLabel(sale.paymentMethod);
  const stockNote =
    lines.length > 1
      ? `${lines.length} produits — stock mis à jour pour chaque article.`
      : 'Stock diminué selon la quantité vendue.';

  return `<!DOCTYPE html>
<html lang="fr-CA">
<head>
  <meta charset="UTF-8" />
  <title>Reçu ${sale.saleNumber}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", system-ui, sans-serif; max-width: 420px; margin: 2rem auto; padding: 1.5rem; color: #111; }
    .receipt { border: 2px solid #1a6b4a; border-radius: 8px; padding: 1.25rem; }
    .receipt__head { text-align: center; border-bottom: 1px dashed #ccc; padding-bottom: 1rem; margin-bottom: 1rem; }
    .receipt__head h1 { margin: 0 0 0.25rem; font-size: 1.25rem; color: #0d4a32; }
    .receipt__sub { font-size: 0.8rem; color: #555; margin: 0.15rem 0; }
    .receipt__sale-no { font-size: 1.15rem; font-weight: 700; margin: 0.75rem 0 0.35rem; color: #0d4a32; }
    .receipt__title { font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.12em; color: #666; margin: 0; }
    table.meta { width: 100%; font-size: 0.88rem; margin: 0 0 1rem; border-collapse: collapse; }
    table.meta td { padding: 0.35rem 0; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    .meta-label { color: #666; width: 42%; font-weight: 600; }
    table.items { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin: 0.5rem 0 1rem; }
    table.items th, table.items td { padding: 0.45rem 0; text-align: left; border-bottom: 1px solid #eee; }
    table.items th { font-size: 0.72rem; text-transform: uppercase; color: #666; }
    table.items td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .stock-note { font-size: 0.8rem; color: #0d4a32; background: #d8efe4; padding: 0.5rem 0.65rem; border-radius: 6px; margin-bottom: 0.75rem; }
    .totals { border-top: 2px solid #1a6b4a; padding-top: 0.75rem; font-size: 0.9rem; }
    .totals div { display: flex; justify-content: space-between; padding: 0.2rem 0; }
    .totals .grand { font-size: 1.2rem; font-weight: 700; margin-top: 0.5rem; color: #0d4a32; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 2rem; font-size: 0.8rem; }
    .signatures .line { border-top: 1px solid #333; margin-top: 2.5rem; padding-top: 0.35rem; text-align: center; color: #444; }
    .footer { text-align: center; font-size: 0.72rem; color: #666; margin-top: 1.25rem; }
    @media print { body { margin: 0; max-width: none; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="receipt__head">
      <h1>${escapeHtml(business)}</h1>
      ${p.businessAddress ? `<p class="receipt__sub">${escapeHtml(p.businessAddress)}</p>` : ''}
      ${p.businessPhone ? `<p class="receipt__sub">Tél. : ${escapeHtml(p.businessPhone)}</p>` : ''}
      <p class="receipt__title">Reçu / facture de vente</p>
      <p class="receipt__sale-no">N° ${escapeHtml(sale.saleNumber)}</p>
    </div>
    <table class="meta">
      ${metaRow('Date de vente', saleDate)}
      ${metaRow('Vendeur', seller)}
      ${metaRow('Acheteur', buyer)}
      ${metaRow('Paiement', payment)}
    </table>
    <p class="stock-note">${escapeHtml(stockNote)}</p>
    <table class="items">
      <thead>
        <tr><th>Description</th><th class="num">Qté</th><th class="num">Prix unit.</th><th class="num">Montant</th></tr>
      </thead>
      <tbody>${linesTableHtml(lines)}</tbody>
    </table>
    <div class="totals">
      <div class="grand"><span>Total payé</span><span>${formatMoney(totals.total)}</span></div>
    </div>
    ${sale.note ? `<p style="font-size:0.85rem;margin-top:1rem"><strong>Remarque :</strong> ${escapeHtml(sale.note)}</p>` : ''}
    <div class="signatures">
      <div><div class="line">Signature vendeur</div></div>
      <div><div class="line">Signature acheteur</div></div>
    </div>
    <p class="footer">Merci de votre achat.</p>
  </div>
  <p class="no-print" style="text-align:center;margin-top:1.5rem">
    <button onclick="window.print()" style="padding:0.6rem 1.5rem;font-size:1rem;cursor:pointer;background:#1a6b4a;color:#fff;border:none;border-radius:6px">Imprimer le reçu</button>
  </p>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function printReceipt(state, sale) {
  const html = buildReceiptHtml(state, sale);
  const w = window.open('', '_blank', 'width=440,height=800');
  if (!w) {
    alert('Autorisez les fenêtres pop-up pour imprimer le reçu.');
    return;
  }
  w.document.write(html);
  w.document.close();
}

function movementToReceiptLine(state, mov) {
  const product = (state.products || []).find((p) => p.id === mov.productId);
  return {
    productName: product?.name || 'Produit',
    unit: product?.unit || 'unité',
    qty: mov.qty,
    unitPrice: mov.unitPrice ?? 0,
    lineTotal: mov.lineTotal ?? lineTotal(mov.qty, mov.unitPrice || 0),
  };
}

function saleToReceipt(state, saleGroup) {
  const first = saleGroup.lines[0] || saleGroup;
  const p = state.profile;
  return {
    saleNumber: saleGroup.saleNumber,
    date: saleGroup.date || first.date,
    soldAt: saleGroup.soldAt || first.soldAt,
    sellerName: saleGroup.sellerName || first.sellerName || p.sellerName || '',
    buyerName: saleGroup.clientName || first.clientName || '',
    clientName: saleGroup.clientName || first.clientName || '',
    paymentMethod: saleGroup.paymentMethod || first.paymentMethod || 'cash',
    note: saleGroup.note || first.note || '',
    lineTotal: saleGroup.lineTotal,
    lines: saleGroup.lines.map((m) => movementToReceiptLine(state, m)),
  };
}

/** @deprecated utiliser saleToReceipt */
function movementToReceipt(state, mov) {
  return saleToReceipt(state, {
    ...mov,
    lines: [mov],
    lineTotal: mov.lineTotal,
  });
}


function saleUid() {
  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Regroupe les mouvements vente par numéro de vente. */
function groupSales(state) {
  const ventes = (state.stockMovements || []).filter((m) => m.type === 'vente' && m.saleNumber);
  const map = new Map();

  for (const m of ventes) {
    const key = m.saleNumber;
    if (!map.has(key)) {
      map.set(key, {
        saleNumber: key,
        saleId: m.saleId || key,
        date: m.date,
        soldAt: m.soldAt,
        clientName: m.clientName || '',
        sellerName: m.sellerName || '',
        paymentMethod: m.paymentMethod || 'cash',
        tpsIncluded: !!m.tpsIncluded,
        note: m.note || '',
        lines: [],
        lineTotal: 0,
      });
    }
    const sale = map.get(key);
    sale.lines.push(m);
    sale.lineTotal += Number(m.lineTotal) || 0;
    if (m.soldAt && (!sale.soldAt || m.soldAt > sale.soldAt)) sale.soldAt = m.soldAt;
  }

  return [...map.values()].sort((a, b) => (b.soldAt || b.date).localeCompare(a.soldAt || a.date));
}

function salePretPaidAt(sale) {
  const line = sale.lines?.find((l) => l.pretPaidAt);
  return line?.pretPaidAt || null;
}

function getMovementsForSale(state, saleNumber) {
  return (state.stockMovements || []).filter(
    (m) => m.type === 'vente' && m.saleNumber === saleNumber
  );
}

function stockRemaining(state, productId, excludeSaleNumber = null) {
  const inv = computeInventory(state);
  const row = inv.find((x) => x.id === productId);
  if (!row) return 0;

  let extra = 0;
  if (excludeSaleNumber) {
    extra = getMovementsForSale(state, excludeSaleNumber)
      .filter((m) => m.productId === productId)
      .reduce((s, m) => s + Number(m.qty), 0);
  }
  return row.remaining + extra;
}

function validateCartLine(line, state, cart, excludeSaleNumber = null) {
  const errors = [];
  const qty = Number(line.qty);
  const price = Number(line.unitPrice);

  if (!line.productId) errors.push('Choisissez un produit.');
  if (!Number.isFinite(qty) || qty <= 0) errors.push('Quantité invalide.');
  if (!Number.isFinite(price) || price < 0) errors.push('Prix unitaire invalide.');

  const product = (state.products || []).find((p) => p.id === line.productId);
  const inCart = cart
    .filter((l) => l.productId === line.productId)
    .reduce((s, l) => s + Number(l.qty), 0);
  const available = stockRemaining(state, line.productId, excludeSaleNumber);

  if (product && qty + inCart > available) {
    errors.push(
      `Stock insuffisant pour « ${product.name} » : reste ${available} ${saleUnitLabel(product)}, demandé ${qty + inCart}.`
    );
  }
  return { ok: errors.length === 0, errors };
}

function validateCartCheckout(cart, buyerName) {
  const errors = [];
  if (!cart.length) errors.push('Ajoutez au moins un produit au panier.');
  if (!buyerName?.trim()) errors.push('Nom de l\'acheteur obligatoire.');
  return { ok: errors.length === 0, errors };
}

function cartGrandTotal(cart) {
  return cart.reduce((s, l) => s + lineTotal(l.qty, l.unitPrice), 0);
}


function isPretPayment(method) {
  return method === 'pret' || method === 'credit';
}

function saleIsPaid(sale) {
  if (!sale?.lines?.length) return false;
  return sale.lines.every((l) => !!l.pretPaidAt);
}

function getOpenPretSales(state) {
  return groupSales(state).filter(
    (s) => isPretPayment(s.paymentMethod) && !saleIsPaid(s)
  );
}

function getPaidPretSales(state) {
  return groupSales(state).filter(
    (s) => isPretPayment(s.paymentMethod) && saleIsPaid(s)
  );
}

function pretByClient(state) {
  const map = new Map();
  for (const sale of getOpenPretSales(state)) {
    const name = (sale.clientName || 'Client inconnu').trim() || 'Client inconnu';
    if (!map.has(name)) {
      map.set(name, { clientName: name, sales: [], totalOwed: 0 });
    }
    const row = map.get(name);
    row.sales.push(sale);
    row.totalOwed += Number(sale.lineTotal) || 0;
  }
  return [...map.values()].sort((a, b) => b.totalOwed - a.totalOwed);
}

function totalOpenPret(state) {
  return getOpenPretSales(state).reduce((s, sale) => s + (Number(sale.lineTotal) || 0), 0);
}

function pretPaidDate(sale) {
  return sale.lines?.[0]?.pretPaidAt || null;
}

function pretPaidNote(sale) {
  return sale.lines?.[0]?.pretPaidNote || '';
}

/** Applique le paiement d'une vente en prêt (mouvements + rentrée). */
function settlePretSale(state, saleNumber, paidDate, note) {
  const sale = groupSales(state).find((s) => s.saleNumber === saleNumber);
  if (!sale) return { ok: false, errors: ['Vente introuvable.'] };
  if (!isPretPayment(sale.paymentMethod)) {
    return { ok: false, errors: ['Cette vente n\'est pas en prêt.'] };
  }
  if (saleIsPaid(sale)) return { ok: false, errors: ['Déjà encaissé.'] };

  const paidAt = paidDate || new Date().toISOString().slice(0, 10);
  for (const m of state.stockMovements) {
    if (m.type === 'vente' && m.saleNumber === saleNumber) {
      m.pretPaidAt = paidAt;
      m.pretPaidNote = note || '';
    }
  }

  const hasRentree = (state.transactions || []).some(
    (t) => t.type === 'rentree' && t.saleNumber === saleNumber
  );
  if (!hasRentree) {
    return {
      ok: true,
      sale,
      paidAt,
      needsRentree: true,
      amount: sale.lineTotal,
    };
  }
  return { ok: true, sale, paidAt, needsRentree: false };
}

function unsettlePretSale(state, saleNumber) {
  const sale = groupSales(state).find((s) => s.saleNumber === saleNumber);
  if (!sale || !isPretPayment(sale.paymentMethod)) {
    return { ok: false, errors: ['Vente en prêt introuvable.'] };
  }
  for (const m of state.stockMovements) {
    if (m.type === 'vente' && m.saleNumber === saleNumber) {
      delete m.pretPaidAt;
      delete m.pretPaidNote;
    }
  }
  state.transactions = (state.transactions || []).filter(
    (t) => !(t.type === 'rentree' && t.saleNumber === saleNumber && t.pretSettlement)
  );
  return { ok: true };
}


function getLinkedSortie(state, movementId) {
  return (state.transactions || []).find(
    (t) => t.type === 'sortie' && t.linkedMovementId === movementId
  );
}

/** Crée ou met à jour la sortie liée à un achat stock. */
function upsertLinkedAchatSortie(state, mov, amount, productName) {
  const label = `Achat stock — ${productName}`;
  const existing = getLinkedSortie(state, mov.id);
  if (existing) {
    existing.date = mov.date;
    existing.amount = amount;
    existing.label = label;
    existing.category = 'achat';
    existing.stockLinked = true;
    existing.linkedMovementId = mov.id;
    return existing;
  }
  const tx = {
    id: uid(),
    type: 'sortie',
    date: mov.date,
    amount,
    category: 'achat',
    label,
    linkedMovementId: mov.id,
    stockLinked: true,
    approvedLarge: amount <= 5000,
  };
  state.transactions.push(tx);
  return tx;
}

function removeAchatMovement(state, movementId) {
  state.stockMovements = (state.stockMovements || []).filter((m) => m.id !== movementId);
  state.transactions = (state.transactions || []).filter(
    (t) => !(t.type === 'sortie' && t.linkedMovementId === movementId)
  );
}

function removeStockLinkedTransaction(state, txId) {
  const tx = (state.transactions || []).find((t) => t.id === txId);
  if (!tx) return;
  if (tx.linkedMovementId) {
    state.stockMovements = (state.stockMovements || []).filter((m) => m.id !== tx.linkedMovementId);
  }
  state.transactions = state.transactions.filter((t) => t.id !== txId);
}

function isStockLinkedTransaction(tx) {
  if (!tx) return false;
  return !!(tx.linkedMovementId || tx.stockLinked || tx.saleNumber);
}

/**
 * Vérifie la cohérence stock (entrées/sorties produits) ↔ opérations financières.
 */
function auditStockFinance(state) {
  const alerts = [];
  const sales = groupSales(state);
  const saleNumbers = new Set(sales.map((s) => s.saleNumber));

  for (const sale of sales) {
    const hasRentree = (state.transactions || []).some(
      (t) => t.type === 'rentree' && t.saleNumber === sale.saleNumber
    );
    const pretOpen = isPretPayment(sale.paymentMethod) && !saleIsPaid(sale);
    if (!hasRentree && !pretOpen) {
      alerts.push({
        level: 'critique',
        text: `Vente ${sale.saleNumber} (${sale.clientName || 'client'}) : stock sorti mais pas de rentrée — utilisez Reçus / Ventes ou encaissez le prêt.`,
      });
    }
  }

  for (const t of state.transactions || []) {
    if (
      t.type === 'rentree' &&
      (t.category === 'vente' || t.category === 'repas') &&
      t.saleNumber &&
      !saleNumbers.has(t.saleNumber)
    ) {
      alerts.push({
        level: 'critique',
        text: `Rentrée « ${t.label} » sans vente stock liée (N° ${t.saleNumber} introuvable).`,
      });
    }
    if (
      t.type === 'rentree' &&
      (t.category === 'vente' || t.category === 'repas') &&
      !t.saleNumber &&
      !t.pretSettlement
    ) {
      alerts.push({
        level: 'avertissement',
        text: `Rentrée manuelle « ${t.label} » : enregistrez les ventes produits via Reçus / Ventes pour lier stock et argent.`,
      });
    }
  }

  const achatMovs = (state.stockMovements || []).filter((m) => m.type === 'achat');
  for (const m of achatMovs) {
    const hasSortie = (state.transactions || []).some(
      (t) => t.type === 'sortie' && t.linkedMovementId === m.id
    );
    if (!hasSortie) {
      const name =
        state.products.find((p) => p.id === m.productId)?.name || 'produit';
      alerts.push({
        level: 'critique',
        text: `Achat stock « ${name} » (${m.date}) sans sortie liée — enregistrez le montant payé à l'achat (Produits/Stock).`,
      });
    }
  }

  for (const t of state.transactions || []) {
    if (t.type === 'sortie' && t.category === 'achat' && t.linkedMovementId) {
      const mov = (state.stockMovements || []).find((m) => m.id === t.linkedMovementId);
      if (!mov || mov.type !== 'achat') {
        alerts.push({
          level: 'avertissement',
          text: `Sortie « ${t.label} » : mouvement stock introuvable.`,
        });
      }
    }
    if (t.type === 'sortie' && t.category === 'achat' && !t.linkedMovementId) {
      alerts.push({
        level: 'critique',
        text: `Sortie achat « ${t.label} » non liée au stock — utilisez Produits/Stock → Achat (connexion auto).`,
      });
    }
  }

  const inv = computeInventory(state);
  for (const row of inv) {
    if (row.remaining < 0) {
      alerts.push({
        level: 'critique',
        text: `${row.name} : plus vendu qu'acheté en stock (${row.remaining}) — corrigez quantités.`,
      });
    }
  }

  const stockSoldTotal = sales.reduce((s, sale) => s + (Number(sale.lineTotal) || 0), 0);
  const financeSalesTotal = (state.transactions || [])
    .filter(
      (t) =>
        t.type === 'rentree' &&
        (t.category === 'vente' || t.category === 'repas') &&
        t.saleNumber
    )
    .reduce((s, t) => s + Number(t.amount), 0);
  const pretOpenTotal = sales
    .filter((s) => isPretPayment(s.paymentMethod) && !saleIsPaid(s))
    .reduce((s, sale) => s + (Number(sale.lineTotal) || 0), 0);

  const expectedFinance = stockSoldTotal - pretOpenTotal;
  if (
    Math.abs(financeSalesTotal - expectedFinance) > 0.02 &&
    stockSoldTotal > 0
  ) {
    alerts.push({
      level: 'avertissement',
      text: `Écart ventes stock (${stockSoldTotal.toFixed(2)}) vs rentrées liées (${financeSalesTotal.toFixed(2)}) — vérifiez prêts et doublons.`,
    });
  }

  return alerts;
}

/** Menu Aide — sommaire puis une section à la fois */

const HELP_SECTIONS = [
  {
    id: 'demarrage',
    num: 1,
    title: 'Démarrage',
    body: `
  <p>Cette application sert à suivre l'argent, le stock et les ventes de <strong>Manoue Bar</strong> (Haïti, gourdes HTG, sans taxe sur les ventes).</p>
  <ol class="help-steps">
    <li>Double-cliquez <strong>Lancer Etat financier.bat</strong> (ou <strong>OUVRIR Etat financier.bat</strong>).</li>
    <li>L'app s'ouvre dans le navigateur (Chrome ou Safari recommandés).</li>
    <li>Sur téléphone : copiez le dossier complet sur l'appareil ou utilisez le navigateur du même réseau.</li>
    <li>Ne supprimez pas le dossier <strong>js</strong> ni <strong>css</strong> — l'app en a besoin.</li>
  </ol>
  <p class="help-note">Toutes les données restent sur <strong>votre appareil</strong> (localStorage). Faites des exports JSON réguliers en secours.</p>`,
  },
  {
    id: 'entete',
    num: 2,
    title: 'En-tête et indicateurs',
    body: `
  <p>En haut de chaque écran, vous voyez le nom <strong>Manoue Bar</strong> et cinq chiffres :</p>
  <dl class="help-dl">
    <dt>Solde cumulé</dt>
    <dd>Tout l'argent entré moins tout l'argent sorti, depuis le début.</dd>
    <dt>Net ce mois</dt>
    <dd>Rentrées du mois − sorties du mois.</dd>
    <dt>Rentrées (mois)</dt>
    <dd>Total des entrées d'argent ce mois (ventes cash, encaissements prêt, autres rentrées).</dd>
    <dt>Sorties (mois)</dt>
    <dd>Total des dépenses ce mois (achats stock, salaires, loyer, etc.).</dd>
    <dt>Paie nette (mois)</dt>
    <dd>Estimation du net à payer aux employés enregistrés (onglet Paie).</dd>
  </dl>
  <p>Les menus se choisissent dans la barre d'onglets juste en dessous. Sur mobile, faites glisser horizontalement pour voir tous les onglets.</p>`,
  },
  {
    id: 'tableau',
    num: 3,
    title: 'Tableau de bord',
    body: `
  <h4>Alertes — prévenir les erreurs</h4>
  <p>Liste automatique des problèmes à corriger :</p>
  <ul>
    <li>Solde négatif ou sorties supérieures aux rentrées du mois.</li>
    <li>Écart entre le stock et les opérations financières liées.</li>
    <li>Stock bas ou vente impossible (stock insuffisant).</li>
    <li>Prêts clients en attente d'encaissement.</li>
  </ul>
  <p>Consultez cette section <strong>chaque soir</strong> avant de fermer.</p>
  <h4>Recommandations &amp; marché</h4>
  <p>Conseils générés selon votre activité (marge, stock, prêts). Aide à décider quoi réapprovisionner ou surveiller.</p>`,
  },
  {
    id: 'operations',
    num: 4,
    title: 'Opérations',
    body: `
  <p>Pour les entrées et sorties d'argent <strong>qui ne passent pas par une vente ou un achat stock</strong> (loyer, salaire manuel, subvention, etc.).</p>
  <h4>Formulaire « Nouvelle opération »</h4>
  <dl class="help-dl">
    <dt>Type</dt>
    <dd><strong>Rentrée</strong> = argent reçu. <strong>Sortie</strong> = argent dépensé.</dd>
    <dt>Date</dt>
    <dd>Date réelle de l'opération (pas dans le futur).</dd>
    <dt>Montant ($)</dt>
    <dd>Montant en gourdes. Doit être supérieur à 0 pour enregistrer.</dd>
    <dt>Catégorie</dt>
    <dd>Classe l'opération (vente, repas, service, salaire, loyer, fournisseur, etc.).</dd>
    <dt>Libellé</dt>
    <dd>Description courte (ex. « Loyer mai », « Facture électricité »).</dd>
    <dt>Case sortie &gt; 5 000 $</dt>
    <dd>À cocher pour confirmer une grosse sortie (avertissement).</dd>
    <dt>Enregistrer</dt>
    <dd>Valide l'opération. Le solde se met à jour tout de suite.</dd>
  </dl>
  <p class="help-warn"><strong>Interdit ici :</strong> achats de marchandise (→ Produits/Stock) et rentrées de vente produit (→ Reçus/Ventes). Le système vous bloquera.</p>
  <h4>Journal des opérations</h4>
  <p>Tableau de toutes les opérations. Colonnes : Date, Type, Catégorie, Libellé, Montant.</p>
  <ul>
    <li><strong>Modif.</strong> — corriger une opération manuelle (pas les lignes liées au stock).</li>
    <li><strong>Suppr.</strong> — effacer une opération (confirmation demandée).</li>
    <li>Les lignes avec badge <strong>auto</strong> viennent du stock : modifiez via Stock ou Reçus.</li>
  </ul>
  <h4>Plan rapide</h4>
  <p>Rappel : saisie le jour même, vérification des alertes, export en fin de journée.</p>`,
  },
  {
    id: 'recu',
    num: 5,
    title: 'Reçus / Ventes',
    body: `
  <p>C'est l'onglet principal pour <strong>vendre</strong> et imprimer un reçu au client si vous le souhaitez.</p>
  <p class="help-warn"><strong>Règle d'or :</strong> remplir le panier ne suffit pas. Il faut cliquer <strong>Payer</strong> (cash) ou <strong>Enregistrer le prêt</strong> (crédit) pour que la vente compte.</p>
  <h4>Gestion des produits</h4>
  <dl class="help-dl">
    <dt>Nom du produit</dt>
    <dd>Ex. Coca-Cola, Soupe giromon, Prestige.</dd>
    <dt>Unité de vente</dt>
    <dd>Bouteille, portion, verre, etc.</dd>
    <dt>Achat stock</dt>
    <dd>Unité fournisseur (caisse, sac…) et contenu par achat.</dd>
  </dl>
  <h4>Panier</h4>
  <ol class="help-steps">
    <li>Choisissez <strong>Produit</strong>, vérifiez le stock disponible.</li>
    <li>Saisissez <strong>Quantité</strong> et <strong>Prix unitaire</strong>.</li>
    <li>Cliquez <strong>+ Ajouter au panier</strong>.</li>
  </ol>
  <h4>Payer et enregistrer</h4>
  <dl class="help-dl">
    <dt>Nom de l'acheteur</dt>
    <dd><strong>Obligatoire.</strong></dd>
    <dt>Paiement Cash</dt>
    <dd>Sortie stock + rentrée d'argent.</dd>
    <dt>Paiement Prêt</dt>
    <dd>Sortie stock seulement — encaisser plus tard dans Clients en prêt.</dd>
    <dt>Imprimer le reçu</dt>
    <dd>Optionnel pour le client.</dd>
  </dl>
  <h4>Liste des reçus</h4>
  <p><strong>Reçu</strong>, <strong>Modif.</strong>, <strong>Suppr.</strong> sur chaque vente enregistrée.</p>`,
  },
  {
    id: 'pret',
    num: 6,
    title: 'Clients en prêt',
    body: `
  <p>Clients qui ont acheté en <strong>Prêt (crédit)</strong> sans encore rembourser.</p>
  <p class="help-note">Pas de liste séparée : saisissez le <strong>Nom de l'acheteur</strong> à chaque vente. Utilisez toujours le même nom pour un même client.</p>
  <h4>Sommaire par client</h4>
  <p>Nombre de ventes en prêt et <strong>total dû</strong> par client.</p>
  <h4>Ventes en attente</h4>
  <ol class="help-steps">
    <li>Cliquez <strong>Encaisser</strong> quand le client paie.</li>
    <li>La rentrée est créée dans Opérations.</li>
    <li>La vente passe dans « Prêts déjà encaissés ».</li>
  </ol>`,
  },
  {
    id: 'stock',
    num: 7,
    title: 'Produits / Stock',
    body: `
  <h4>Inventaire</h4>
  <ul>
    <li><strong>Acheté</strong> — entrées fournisseur.</li>
    <li><strong>Vendu</strong> — sorties par ventes.</li>
    <li><strong>Restant</strong> — stock actuel.</li>
  </ul>
  <h4>Achat fournisseur</h4>
  <p>Chaque achat augmente le stock <strong>et</strong> crée une sortie dans Opérations (montant obligatoire).</p>
  <dl class="help-dl">
    <dt>Quantité / Date / Note</dt>
    <dd>Détails de l'achat.</dd>
    <dt>Montant payé (Gdes)</dt>
    <dd>Coût total → sortie auto liée.</dd>
  </dl>
  <p><strong>Modif.</strong> ou <strong>Suppr.</strong> un achat met à jour stock et sortie ensemble.</p>`,
  },
  {
    id: 'paie',
    num: 8,
    title: 'Paie',
    body: `
  <h4>Ajouter un employé</h4>
  <dl class="help-dl">
    <dt>Nom / Rôle</dt>
    <dd>Identification de l'employé.</dd>
    <dt>Salaire brut mensuel</dt>
    <dd>En gourdes (&gt; 0 pour enregistrer).</dd>
  </dl>
  <p>Tableau : brut, retenues, net. <strong>Modif.</strong> / <strong>Suppr.</strong> par ligne.</p>
  <p class="help-note">Retenues à 0 par défaut (Haïti). Pour payer un salaire : <strong>Sortie</strong> catégorie Salaire dans Opérations.</p>`,
  },
  {
    id: 'rapports',
    num: 9,
    title: 'Rapports',
    body: `
  <dl class="help-dl">
    <dt>Période</dt>
    <dd>Journalier, mensuel ou annuel.</dd>
    <dt>Exporter JSON</dt>
    <dd>Sauvegarde structurée.</dd>
    <dt>Exporter Markdown</dt>
    <dd>Rapport lisible à imprimer.</dd>
    <dt>Aperçu</dt>
    <dd>Rentrées, sorties, net, solde, détail des opérations.</dd>
  </dl>`,
  },
  {
    id: 'parametres',
    num: 10,
    title: 'Paramètres',
    body: `
  <h4>Entreprise</h4>
  <dl class="help-dl">
    <dt>Nom du business</dt>
    <dd>Manoue Bar (en-tête et reçus).</dd>
    <dt>Vendeur / Adresse / Téléphone</dt>
    <dd>Sur les reçus clients.</dd>
  </dl>
  <h4>Sauvegarde</h4>
  <ul>
    <li><strong>Importer JSON</strong> — restaurer une sauvegarde.</li>
    <li><strong>Charger démo</strong> — exemple de test.</li>
    <li><strong>Nettoyer produits obsolètes</strong>.</li>
    <li><strong>Remettre tout à zéro</strong> — efface tout (exportez avant).</li>
  </ul>`,
  },
  {
    id: 'regles',
    num: 11,
    title: 'Règles importantes',
    body: `
  <table class="help-table">
    <thead><tr><th>Action</th><th>Où</th><th>Effet auto</th></tr></thead>
    <tbody>
      <tr><td>Achat marchandise</td><td>Stock → Achat</td><td>Stock + ; sortie Opérations</td></tr>
      <tr><td>Vente cash</td><td>Reçus → Payer</td><td>Stock − ; rentrée</td></tr>
      <tr><td>Vente prêt</td><td>Reçus → Enregistrer le prêt</td><td>Stock − ; encaisser plus tard</td></tr>
      <tr><td>Encaisser prêt</td><td>Clients en prêt</td><td>Rentrée Opérations</td></tr>
      <tr><td>Loyer, salaire…</td><td>Opérations</td><td>Sortie ou rentrée manuelle</td></tr>
    </tbody>
  </table>
  <p>Pas de taxe sur les ventes (Haïti).</p>`,
  },
  {
    id: 'quotidien',
    num: 12,
    title: 'Routine quotidienne',
    body: `
  <ol class="help-steps">
    <li><strong>Matin</strong> — Achats fournisseur (Stock) si livraison.</li>
    <li><strong>Service</strong> — Panier → Payer ou Prêt pour chaque vente.</li>
    <li><strong>Dimanche</strong> — Soupe giromon en portion ; prêt possible.</li>
    <li><strong>Soir</strong> — Tableau de bord : alertes.</li>
    <li><strong>Semaine</strong> — Exporter JSON en sauvegarde.</li>
  </ol>`,
  },
  {
    id: 'faq',
    num: 13,
    title: 'Questions fréquentes',
    body: `
  <dl class="help-dl">
    <dt>Le panier ne diminue pas le stock</dt>
    <dd>Cliquez <strong>Payer</strong> ou <strong>Enregistrer le prêt</strong>.</dd>
    <dt>Sortie « achat » bloquée</dt>
    <dd>Utilisez Stock → Achat, pas Opérations.</dd>
    <dt>Stock négatif</dt>
    <dd>Enregistrez un achat ou corrigez la vente.</dd>
    <dt>Nom Manoue Bar absent</dt>
    <dd>Paramètres → Enregistrer → Ctrl+F5.</dd>
    <dt>Données perdues</dt>
    <dd>Paramètres → Importer JSON.</dd>
    <dt>Client en prêt</dt>
    <dd>Reçus → Nom acheteur + Prêt → Enregistrer le prêt.</dd>
  </dl>`,
  },
];

function sectionById(id) {
  return HELP_SECTIONS.find((s) => s.id === id);
}

function showHelpIndex(container) {
  const items = HELP_SECTIONS.map(
    (s) =>
      `<li><button type="button" class="help-menu__item" data-help-id="${s.id}"><span class="help-menu__num">${s.num}</span><span class="help-menu__label">${s.title}</span></button></li>`
  ).join('');
  container.innerHTML = `
    <nav class="help-menu" aria-label="Sommaire de l'aide">
      <p class="help-menu__intro">Choisissez un sujet pour voir les instructions détaillées.</p>
      <ul class="help-menu__list">${items}</ul>
    </nav>`;
}

function showHelpSection(container, id) {
  const sec = sectionById(id);
  if (!sec) {
    showHelpIndex(container);
    return;
  }
  container.innerHTML = `
    <div class="help-detail">
      <button type="button" class="btn btn--ghost help-back" data-help-back>← Retour au sommaire</button>
      <article class="help-section help-section--solo">
        <h3>${sec.num}. ${sec.title}</h3>
        ${sec.body}
      </article>
    </div>`;
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindHelpNav(container) {
  if (container.dataset.helpBound === '1') return;
  container.dataset.helpBound = '1';
  container.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-help-id]');
    if (pick) {
      showHelpSection(container, pick.dataset.helpId);
      return;
    }
    if (e.target.closest('[data-help-back]')) {
      showHelpIndex(container);
    }
  });
}

function renderHelpContent(container) {
  if (!container) return;
  bindHelpNav(container);
  showHelpIndex(container);
}

function resetHelpView(container) {
  if (container) showHelpIndex(container);
}


let state = loadState();
let editingTxId = null;
let editingEmployeeId = null;
let editingProductId = null;
let editingMovementId = null;
let saleCart = [];
let editingSaleNumber = null;

const CATEGORIES = {
  rentree: [
    { value: 'vente', label: 'Vente' },
    { value: 'repas', label: 'Repas du dimanche' },
    { value: 'service', label: 'Service' },
    { value: 'subvention', label: 'Subvention' },
    { value: 'autre-rentree', label: 'Autre rentrée' },
  ],
  sortie: [
    { value: 'salaire', label: 'Salaire / paie' },
    { value: 'loyer', label: 'Loyer / locaux' },
    { value: 'fournisseur', label: 'Fournisseur' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'autre-sortie', label: 'Autre sortie' },
  ],
};

function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function init() {
  try {
    bindTabs();
    bindForms();
    renderHelpContent(document.getElementById('help-content'));
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

function refreshCategoryOptions() {
  const type = document.getElementById('tx-type').value;
  const sel = document.getElementById('tx-category');
  const list = CATEGORIES[type] || [];
  sel.innerHTML = list.map((c) => `<option value="${c.value}">${c.label}</option>`).join('');
}

function onSubmitTx(e) {
  e.preventDefault();
  const box = document.getElementById('tx-validation');
  box.innerHTML = '';

  const tx = {
    id: editingTxId || uid(),
    type: document.getElementById('tx-type').value,
    date: document.getElementById('tx-date').value,
    amount: document.getElementById('tx-amount').value,
    category: document.getElementById('tx-category').value,
    label: document.getElementById('tx-label').value.trim(),
    approvedLarge: document.getElementById('tx-large-ok').checked,
  };

  const amount = Number(tx.amount);
  const others = editingTxId
    ? state.transactions.filter((t) => t.id !== editingTxId)
    : state.transactions;
  const balance = balanceAt(others);
  const delta = tx.type === 'rentree' ? amount : -amount;
  const projected = balance + delta;

  const result = validateTransaction(tx, others, projected, editingTxId);

  if (result.warnings.length) {
    box.innerHTML += result.warnings
      .map((w) => `<div class="alert alert--warn">${escapeHtml(w)}</div>`)
      .join('');
  }

  if (!result.ok) {
    box.innerHTML += result.errors
      .map((err) => `<div class="alert alert--danger">${escapeHtml(err)}</div>`)
      .join('');
    return;
  }

  tx.amount = amount;
  if (editingTxId) {
    const idx = state.transactions.findIndex((t) => t.id === editingTxId);
    if (idx >= 0) state.transactions[idx] = tx;
  } else {
    state.transactions.push(tx);
  }
  saveState(state);
  const wasEdit = !!editingTxId;
  clearTxEdit();
  renderAll();
  box.innerHTML = `<div class="alert alert--ok">Opération ${wasEdit ? 'mise à jour' : 'enregistrée'} avec succès.</div>`;
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

function onSubmitEmployee(e) {
  e.preventDefault();
  const emp = {
    id: editingEmployeeId || uid(),
    name: document.getElementById('emp-name').value.trim(),
    role: document.getElementById('emp-role').value.trim(),
    grossSalary: Number(document.getElementById('emp-gross').value),
  };
  const v = validateEmployee(emp);
  if (!v.ok) {
    document.getElementById('emp-validation').innerHTML = v.errors
      .map((err) => `<div class="alert alert--danger">${escapeHtml(err)}</div>`)
      .join('');
    return;
  }
  document.getElementById('emp-validation').innerHTML = '';
  if (editingEmployeeId) {
    const idx = state.employees.findIndex((x) => x.id === editingEmployeeId);
    if (idx >= 0) state.employees[idx] = emp;
  } else {
    state.employees.push(emp);
  }
  saveState(state);
  clearEmployeeEdit();
  renderAll();
}

function startEditEmployee(id) {
  const emp = state.employees.find((x) => x.id === id);
  if (!emp) return;
  editingEmployeeId = id;
  document.getElementById('emp-name').value = emp.name;
  document.getElementById('emp-role').value = emp.role || '';
  document.getElementById('emp-gross').value = emp.grossSalary;
  document.getElementById('emp-form-title').textContent = 'Modifier un employé';
  document.getElementById('emp-submit-btn').textContent = 'Enregistrer les modifications';
  document.getElementById('emp-cancel-edit').hidden = false;
  switchToPanel('paie');
  document.getElementById('form-employee').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearEmployeeEdit() {
  editingEmployeeId = null;
  document.getElementById('form-employee').reset();
  document.getElementById('emp-gross').value = '0';
  document.getElementById('emp-form-title').textContent = 'Ajouter un employé';
  document.getElementById('emp-submit-btn').textContent = 'Ajouter';
  document.getElementById('emp-cancel-edit').hidden = true;
}

function startEditTx(id) {
  const tx = state.transactions.find((x) => x.id === id);
  if (!tx) return;
  if (tx.linkedMovementId || tx.stockLinked) {
    alert('Sortie liée à un achat stock — modifiez via Produits/Stock → Entrée stock.');
    startEditMovement(tx.linkedMovementId);
    return;
  }
  if (tx.saleNumber) {
    alert('Opération liée à une vente — modifiez via Reçus / Ventes.');
    if (tx.type === 'rentree') loadSaleForEdit(tx.saleNumber);
    return;
  }
  editingTxId = id;
  document.getElementById('tx-type').value = tx.type;
  refreshCategoryOptions();
  document.getElementById('tx-category').value = tx.category;
  document.getElementById('tx-date').value = tx.date;
  document.getElementById('tx-amount').value = tx.amount;
  document.getElementById('tx-label').value = tx.label;
  document.getElementById('tx-large-ok').checked = !!tx.approvedLarge;
  document.getElementById('tx-form-title').textContent = 'Modifier une opération';
  document.getElementById('tx-submit-btn').textContent = 'Enregistrer les modifications';
  document.getElementById('tx-cancel-edit').hidden = false;
  switchToPanel('operations');
  document.getElementById('form-tx').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearTxEdit() {
  editingTxId = null;
  document.getElementById('form-tx').reset();
  document.getElementById('tx-date').value = todayISO();
  document.getElementById('tx-amount').value = '0';
  refreshCategoryOptions();
  document.getElementById('tx-form-title').textContent = 'Nouvelle opération';
  document.getElementById('tx-submit-btn').textContent = 'Enregistrer';
  document.getElementById('tx-cancel-edit').hidden = true;
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

function renderTransactions() {
  const tbody = document.getElementById('tx-table-body');
  const sorted = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty-state">Aucune opération — ajoutez une rentrée ou une sortie.</td></tr>';
    return;
  }
  tbody.innerHTML = sorted
    .map((t) => {
      const cls = t.type === 'rentree' ? 'amount-pos' : 'amount-neg';
      const sign = t.type === 'rentree' ? '+' : '−';
      const linked = isStockLinkedTransaction(t);
      const linkBadge = linked
        ? ' <span class="badge badge--avertissement" title="Lié au stock">auto</span>'
        : '';
      const actions = linked
        ? `<button type="button" class="btn btn--ghost btn-sm" data-del-tx="${t.id}">Suppr.</button>`
        : `<button type="button" class="btn btn--ghost btn-sm" data-edit-tx="${t.id}">Modif.</button>
          <button type="button" class="btn btn--ghost btn-sm" data-del-tx="${t.id}">Suppr.</button>`;
      return `<tr>
        <td>${formatDate(t.date)}</td>
        <td><span class="badge badge--${t.type}">${t.type}</span></td>
        <td>${escapeHtml(t.category)}</td>
        <td>${escapeHtml(t.label)}${linkBadge}</td>
        <td class="${cls}">${sign}${formatMoney(t.amount)}</td>
        <td class="actions-cell">${actions}</td>
      </tr>`;
    })
    .join('');

  tbody.querySelectorAll('[data-edit-tx]').forEach((btn) => {
    btn.addEventListener('click', () => startEditTx(btn.dataset.editTx));
  });
  tbody.querySelectorAll('[data-del-tx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tx = state.transactions.find((x) => x.id === btn.dataset.delTx);
      if (!tx) return;
      if (tx.linkedMovementId || tx.stockLinked) {
        if (!confirm('Supprimer cette sortie ET l\'achat stock lié ?')) return;
        removeStockLinkedTransaction(state, tx.id);
      } else if (tx.saleNumber) {
        if (!confirm(`Supprimer l'opération et la vente stock ${tx.saleNumber} ?`)) return;
        deleteSale(tx.saleNumber);
        return;
      } else {
        if (!confirm('Supprimer cette opération ?')) return;
        state.transactions = state.transactions.filter((x) => x.id !== btn.dataset.delTx);
      }
      if (editingTxId === btn.dataset.delTx) clearTxEdit();
      saveState(state);
      renderAll();
    });
  });
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

function renderPayroll() {
  const rows = payrollSummary(state.employees, state.profile);
  const tbody = document.getElementById('payroll-table-body');
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty-state">Ajoutez un employé pour estimer la paie nette.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r) => `<tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.role)}</td>
      <td>${formatMoney(r.gross)}</td>
      <td>${formatMoney(r.deductions)}</td>
      <td class="amount-pos">${formatMoney(r.net)}</td>
      <td class="actions-cell">
        <button type="button" class="btn btn--ghost btn-sm" data-edit-emp="${r.id}">Modif.</button>
        <button type="button" class="btn btn--ghost btn-sm" data-del-emp="${r.id}">Suppr.</button>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-edit-emp]').forEach((btn) => {
    btn.addEventListener('click', () => startEditEmployee(btn.dataset.editEmp));
  });
  tbody.querySelectorAll('[data-del-emp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('Supprimer cet employé ?')) return;
      if (editingEmployeeId === btn.dataset.delEmp) clearEmployeeEdit();
      state.employees = state.employees.filter((x) => x.id !== btn.dataset.delEmp);
      saveState(state);
      renderAll();
    });
  });

  const tot = totalPayrollCost(rows);
  document.getElementById('payroll-totals').innerHTML = `
    <p><strong>Total brut :</strong> ${formatMoney(tot.gross)} —
    <strong>Cotisations :</strong> ${formatMoney(tot.deductions)} —
    <strong>Net employés :</strong> ${formatMoney(tot.net)} —
    <strong>Coût employeur estimé :</strong> ${formatMoney(tot.employerCost)}</p>
    <p class="hint">Estimation pédagogique — consultez un comptable pour les déclarations officielles.</p>`;
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
        <td>${escapeHtml(productLabel(ln.productId))}</td>
        <td>${ln.qty}</td>
        <td>${formatMoney(ln.unitPrice)}</td>
        <td class="amount-pos">${formatMoney(lt)}</td>
        <td><button type="button" class="btn btn--ghost btn-sm" data-rm-cart="${i}">Retirer</button></td>
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
        <td><strong>${escapeHtml(c.clientName)}</strong></td>
        <td>${c.sales.length}</td>
        <td class="amount-neg">${formatMoney(c.totalOwed, cur)}</td>
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
        <td><strong>${escapeHtml(s.saleNumber)}</strong></td>
        <td>${formatDate(s.date)}</td>
        <td>${escapeHtml(s.clientName || '—')}</td>
        <td>${articles}</td>
        <td class="amount-neg">${formatMoney(s.lineTotal, cur)}</td>
        <td class="actions-cell">
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
        <td><strong>${escapeHtml(s.saleNumber)}</strong></td>
        <td>${formatDate(s.date)}</td>
        <td>${formatDate(pretPaidDate(s))}</td>
        <td>${escapeHtml(s.clientName || '—')}</td>
        <td class="amount-pos">${formatMoney(s.lineTotal, cur)}</td>
        <td class="actions-cell">
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
        <td><strong>${escapeHtml(r.name)}</strong></td>
        <td>${escapeHtml(unitHint)}</td>
        <td>${r.bought}</td>
        <td>${r.sold}</td>
        <td class="${cls}">${r.remaining}</td>
        <td class="actions-cell">
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
      <td>${formatDate(m.date)}</td>
      <td>${escapeHtml(productName(m.productId))}</td>
      <td>${escapeHtml(formatAchatQtyCell(m, productById(m.productId)))}</td>
      <td>${escapeHtml(m.note || '—')}</td>
      <td class="actions-cell">
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
      <td><strong>${escapeHtml(s.saleNumber)}</strong></td>
      <td>${formatDate(s.date)}</td>
      <td>${escapeHtml(s.sellerName || state.profile.sellerName || '—')}</td>
      <td>${escapeHtml(s.clientName || '—')}</td>
      <td>${escapeHtml(paymentLabel(s.paymentMethod))}</td>
      <td>${articles}</td>
      <td class="amount-pos">${formatMoney(s.lineTotal)}</td>
      <td class="actions-cell">
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

