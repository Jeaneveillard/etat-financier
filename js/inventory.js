export const PURCHASE_UNIT_OPTIONS = [
  { value: 'unite', label: 'Unité (même à l\'achat et à la vente)' },
  { value: 'caisse', label: 'Caisse' },
  { value: 'sac', label: 'Sac' },
  { value: 'gallon', label: 'Gallon' },
];

export const SALE_UNIT_OPTIONS = [
  { value: 'bouteille', label: 'Bouteille' },
  { value: 'unite', label: 'Unité' },
  { value: 'portion', label: 'Portion' },
  { value: 'gallon', label: 'Gallon' },
  { value: 'sac', label: 'Sac' },
];

export function productUid() {
  return `prod-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function movementUid() {
  return `mov-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function unitsPerPurchase(p) {
  const n = Number(p?.unitsPerPurchase ?? p?.bottlesPerCase);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function purchaseUnitLabel(p) {
  const map = { caisse: 'caisse', sac: 'sac', gallon: 'gallon', unite: 'unité' };
  return map[p?.purchaseUnit] || p?.purchaseUnit || 'unité';
}

export function isBulkPurchaseProduct(p) {
  const pu = p?.purchaseUnit;
  return !!pu && pu !== 'unite';
}

/** @deprecated */
export function isCasePurchaseProduct(p) {
  return isBulkPurchaseProduct(p);
}

export function saleUnitLabel(p) {
  return p?.unit || 'unité';
}

export function productStockHint(p) {
  if (isBulkPurchaseProduct(p)) {
    return `${saleUnitLabel(p)} (achat : ${purchaseUnitLabel(p)} de ${unitsPerPurchase(p)})`;
  }
  return saleUnitLabel(p);
}

export function normalizeProductFields(p) {
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
export function movementBaseQty(m, product) {
  if (m.type === 'achat' && isBulkPurchaseProduct(product)) {
    if (m.purchaseQty != null) {
      return Number(m.purchaseQty) * unitsPerPurchase(product);
    }
    return Number(m.qty || 0);
  }
  return Number(m.qty || 0);
}

export function formatAchatQtyCell(m, product) {
  if (isBulkPurchaseProduct(product)) {
    const per = unitsPerPurchase(product);
    const packs =
      m.purchaseQty != null ? Number(m.purchaseQty) : Number(m.qty || 0) / per;
    const units = Number(m.qty) || packs * per;
    return `${packs} ${purchaseUnitLabel(product)}(s) → ${units} ${saleUnitLabel(product)}`;
  }
  return `+${m.qty} ${saleUnitLabel(product)}`;
}

export function buildAchatMovement(product, rawQty, fields) {
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

export function computeInventory(state) {
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

export function validateProduct(p) {
  const errors = [];
  if (!p.name?.trim()) errors.push('Nom du produit requis.');
  if (!p.unit?.trim()) errors.push('Unité de vente requise.');
  if (isBulkPurchaseProduct(p) && unitsPerPurchase(p) < 1) {
    errors.push('Indiquez combien d\'unités de vente contient chaque achat (caisse, sac, gallon…).');
  }
  return { ok: errors.length === 0, errors };
}

export function validateMovement(mov, state) {
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

export function inventoryAlerts(state) {
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
export function removeProductCompletely(state, productId) {
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
