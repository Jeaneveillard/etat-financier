import { uid, safeMoney, formatMoney, formatDate, todayISO, saveState } from './storage.js';
import { validateTransaction } from './validate.js';
import { balanceAt } from './reports.js';
import { isStockLinkedTransaction, removeStockLinkedTransaction } from './stock-sync.js';
import { deleteSale, loadSaleForEdit } from './sales.js';
import { startEditMovement } from './inventory.js';

export const CATEGORIES = {
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

export let editingTxId = null;

export function refreshCategoryOptions() {
  const type = document.getElementById('tx-type').value;
  const sel = document.getElementById('tx-category');
  const list = CATEGORIES[type] || [];
  sel.innerHTML = list.map((c) => `<option value="${c.value}">${c.label}</option>`).join('');
}

export function onSubmitTx(e) {
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

  const amount = safeMoney(tx.amount);
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

export function startEditTx(id) {
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

export function clearTxEdit() {
  editingTxId = null;
  document.getElementById('form-tx').reset();
  document.getElementById('tx-date').value = todayISO();
  document.getElementById('tx-amount').value = '0';
  refreshCategoryOptions();
  document.getElementById('tx-form-title').textContent = 'Nouvelle opération';
  document.getElementById('tx-submit-btn').textContent = 'Enregistrer';
  document.getElementById('tx-cancel-edit').hidden = true;
}

export function renderTransactions() {
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
        <td data-label="Date">${formatDate(t.date)}</td>
        <td data-label="Type"><span class="badge badge--${t.type}">${t.type}</span></td>
        <td data-label="Catégorie">${escapeHtml(t.category)}</td>
        <td data-label="Libellé">${escapeHtml(t.label)}${linkBadge}</td>
        <td class="${cls}" data-label="Montant">${sign}${formatMoney(t.amount)}</td>
        <td class="actions-cell" data-label="Actions">${actions}</td>
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
