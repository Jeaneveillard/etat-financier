import { todayISO, safeMoney } from './storage.js';

/**
 * Valide une transaction avant enregistrement.
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateTransaction(tx, allTransactions, projectedBalance) {
  const errors = [];
  const warnings = [];

  if (!tx.type || !['rentree', 'sortie'].includes(tx.type)) {
    errors.push('Le type doit être « rentrée » ou « sortie ».');
  }

  const amount = safeMoney(tx.amount);
  if (amount <= 0) {
    errors.push('Le montant doit être un nombre positif supérieur à 0.');
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
  const amount = safeMoney(tx.amount);
  return allTransactions.find((t) => {
    if (tx.id && t.id === tx.id) return false;
    return (
      t.date === tx.date &&
      t.type === tx.type &&
      Math.abs(safeMoney(t.amount) - amount) < 0.01 &&
      t.category === tx.category
    );
  });
}

export function validateEmployee(emp) {
  const errors = [];
  const gross = safeMoney(emp.grossSalary);
  if (!emp.name?.trim()) errors.push('Nom de l\'employé requis.');
  if (gross <= 0) errors.push('Salaire brut mensuel invalide.');
  return { ok: errors.length === 0, errors };
}

export function scanLedger(transactions, balance) {
  const alerts = [];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const monthTx = transactions.filter((t) => t.date >= monthStart);
  const rentrees = safeMoney(monthTx.filter((t) => t.type === 'rentree').reduce((s, t) => s + safeMoney(t.amount), 0));
  const sorties = safeMoney(monthTx.filter((t) => t.type === 'sortie').reduce((s, t) => s + safeMoney(t.amount), 0));

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


