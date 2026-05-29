import { computeInventory, saleUnitLabel } from './inventory.js';
import { lineTotal } from './receipts.js';

export function saleUid() {
  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Regroupe les mouvements vente par numéro de vente. */
export function groupSales(state) {
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

export function salePretPaidAt(sale) {
  const line = sale.lines?.find((l) => l.pretPaidAt);
  return line?.pretPaidAt || null;
}

export function getMovementsForSale(state, saleNumber) {
  return (state.stockMovements || []).filter(
    (m) => m.type === 'vente' && m.saleNumber === saleNumber
  );
}

export function stockRemaining(state, productId, excludeSaleNumber = null) {
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

export function validateCartLine(line, state, cart, excludeSaleNumber = null) {
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

export function validateCartCheckout(cart, buyerName) {
  const errors = [];
  if (!cart.length) errors.push('Ajoutez au moins un produit au panier.');
  if (!buyerName?.trim()) errors.push('Nom de l\'acheteur obligatoire.');
  return { ok: errors.length === 0, errors };
}

export function cartGrandTotal(cart) {
  return cart.reduce((s, l) => s + lineTotal(l.qty, l.unitPrice), 0);
}
