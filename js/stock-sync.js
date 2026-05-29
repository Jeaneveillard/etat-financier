import { groupSales } from './sales.js';
import { saleIsPaid, isPretPayment } from './credit.js';
import { computeInventory } from './inventory.js';
import { uid } from './storage.js';

export function getLinkedSortie(state, movementId) {
  return (state.transactions || []).find(
    (t) => t.type === 'sortie' && t.linkedMovementId === movementId
  );
}

/** Crée ou met à jour la sortie liée à un achat stock. */
export function upsertLinkedAchatSortie(state, mov, amount, productName) {
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

export function removeAchatMovement(state, movementId) {
  state.stockMovements = (state.stockMovements || []).filter((m) => m.id !== movementId);
  state.transactions = (state.transactions || []).filter(
    (t) => !(t.type === 'sortie' && t.linkedMovementId === movementId)
  );
}

export function removeStockLinkedTransaction(state, txId) {
  const tx = (state.transactions || []).find((t) => t.id === txId);
  if (!tx) return;
  if (tx.linkedMovementId) {
    state.stockMovements = (state.stockMovements || []).filter((m) => m.id !== tx.linkedMovementId);
  }
  state.transactions = state.transactions.filter((t) => t.id !== txId);
}

export function isStockLinkedTransaction(tx) {
  if (!tx) return false;
  return !!(tx.linkedMovementId || tx.stockLinked || tx.saleNumber);
}

/**
 * Vérifie la cohérence stock (entrées/sorties produits) ↔ opérations financières.
 */
export function auditStockFinance(state) {
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
