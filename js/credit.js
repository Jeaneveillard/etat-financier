import { groupSales } from './sales.js';

export function isPretPayment(method) {
  return method === 'pret' || method === 'credit';
}

export function saleIsPaid(sale) {
  if (!sale?.lines?.length) return false;
  return sale.lines.every((l) => !!l.pretPaidAt);
}

export function getOpenPretSales(state) {
  return groupSales(state).filter(
    (s) => isPretPayment(s.paymentMethod) && !saleIsPaid(s)
  );
}

export function getPaidPretSales(state) {
  return groupSales(state).filter(
    (s) => isPretPayment(s.paymentMethod) && saleIsPaid(s)
  );
}

export function pretByClient(state) {
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

export function totalOpenPret(state) {
  return getOpenPretSales(state).reduce((s, sale) => s + (Number(sale.lineTotal) || 0), 0);
}

export function pretPaidDate(sale) {
  return sale.lines?.[0]?.pretPaidAt || null;
}

export function pretPaidNote(sale) {
  return sale.lines?.[0]?.pretPaidNote || '';
}

/** Applique le paiement d'une vente en prêt (mouvements + rentrée). */
export function settlePretSale(state, saleNumber, paidDate, note) {
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

export function unsettlePretSale(state, saleNumber) {
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
