const STORAGE_KEY = 'etat_financier_v1';

export const BUSINESS_NAME = 'Manoue Bar';

const LEGACY_BUSINESS_NAMES = new Set([
  'Manoue Dépôt',
  'Manoue Depot',
  'État financier',
  'Etat financier',
  'Entreprise',
]);

export const DEFAULT_PROFILE = {
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

export const DEFAULT_PRODUCTS = [
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

export function syncProductCatalog(state) {
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
export function markDefaultProductRemoved(state, productName) {
  const name = String(productName || '').trim();
  if (!name || !DEFAULT_PRODUCTS.some((d) => d.name === name)) return;
  if (!state.profile.ownerRemovedProductNames) state.profile.ownerRemovedProductNames = [];
  if (!state.profile.ownerRemovedProductNames.includes(name)) {
    state.profile.ownerRemovedProductNames.push(name);
  }
}

let lastCatalogPurge = null;

export function getLastCatalogPurge() {
  return lastCatalogPurge;
}

/** Nom affiché partout (en-tête, reçus, rapports) — jamais vide. */
export function displayBusinessName(profile) {
  const trimmed = String(profile?.businessName || '').trim();
  if (!trimmed || LEGACY_BUSINESS_NAMES.has(trimmed)) return BUSINESS_NAME;
  return trimmed;
}

export function normalizeProfile(profile = {}) {
  const p = { ...DEFAULT_PROFILE, ...profile };
  p.businessName = displayBusinessName(p);
  p.tpsRate = 0;
  p.tvqRate = 0;
  if (!Array.isArray(p.ownerRemovedProductNames)) {
    p.ownerRemovedProductNames = [];
  }
  return p;
}

export function loadState() {
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

export function saveState(state) {
  state.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Erreur lors de la sauvegarde :', err);
    alert('Erreur: impossible de sauvegarder les données. Le stockage local est peut-être plein ou bloqué.');
  }
}

/** Efface opérations, ventes, stock et employés — produits par défaut recréés, soldes à 0. */
export function resetAppState() {
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

export function normalizeState(data) {
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

export function uid() {
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Arrondi sécurisé à 2 décimales pour l'argent, prévient les erreurs de virgule flottante */
export function safeMoney(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

export function formatMoney(n, currency) {
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

export function moneyForState(state, n) {
  return formatMoney(n, state?.profile?.currency);
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

export function formatDateTime(iso) {
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
