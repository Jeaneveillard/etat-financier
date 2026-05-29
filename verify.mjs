/**
 * Vérifications automatiques — modules État financier (sans navigateur).
 * Usage: node verify.mjs
 */
import {
  normalizeState,
  displayBusinessName,
  syncProductCatalog,
  BUSINESS_NAME,
} from './js/storage.js';
import { validateTransaction } from './js/validate.js';
import { computeTotals, balanceAt } from './js/reports.js';
import { productUid, computeInventory, buildAchatMovement, normalizeProductFields } from './js/inventory.js';
import { validateCartCheckout, groupSales } from './js/sales.js';
import { settlePretSale, pretByClient, getOpenPretSales } from './js/credit.js';
import {
  upsertLinkedAchatSortie,
  auditStockFinance,
  getLinkedSortie,
} from './js/stock-sync.js';
import { buildReceiptHtml } from './js/receipts.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  OK', msg);
  } else {
    failed++;
    console.error('  FAIL', msg);
  }
}

function emptyState() {
  const s = normalizeState({});
  syncProductCatalog(s);
  return s;
}

console.log('\n=== État financier — vérifications ===\n');

// Profil Manoue Bar
console.log('Profil');
assert(displayBusinessName({ businessName: '' }) === BUSINESS_NAME, 'nom vide → Manoue Bar');
assert(displayBusinessName({ businessName: 'Entreprise' }) === BUSINESS_NAME, 'legacy Entreprise migré');
assert(normalizeState({ profile: { businessName: 'Manoue Dépôt' } }).profile.businessName === BUSINESS_NAME, 'Manoue Dépôt migré');

// Opérations
console.log('\nOpérations');
const st = emptyState();
st.transactions.push({
  id: 't1',
  type: 'rentree',
  date: '2026-05-01',
  amount: 1000,
  category: 'vente',
  label: 'Test',
});
const sortie = {
  id: 't2',
  type: 'sortie',
  date: '2026-05-02',
  amount: 1500,
  category: 'autre',
  label: 'Sortie test',
};
const bal = balanceAt(st.transactions);
const vNeg = validateTransaction(sortie, st.transactions, bal - sortie.amount);
assert(!vNeg.ok, 'sortie bloquée si solde insuffisant');

// Stock ↔ achat
console.log('\nStock / achat lié');
const prod = normalizeProductFields({
  id: productUid(),
  name: 'Test Cola',
  unit: 'bouteille',
  purchaseUnit: 'unite',
  unitsPerPurchase: 1,
});
st.products.push(prod);
const mov = buildAchatMovement(prod, 10, { id: 'm1', productId: prod.id, date: '2026-05-03', note: 'Fournisseur' });
st.stockMovements.push(mov);
upsertLinkedAchatSortie(st, mov, 500, prod.name);
const sortieLiee = getLinkedSortie(st, mov.id);
assert(!!sortieLiee && sortieLiee.amount === 500, 'achat crée sortie liée');
assert(sortieLiee.stockLinked === true, 'sortie marquée stockLinked');

// Vente cash
console.log('\nVente cash');
const saleNum = 'V-2026-00001';
st.stockMovements.push({
  id: 'v1',
  saleNumber: saleNum,
  productId: prod.id,
  type: 'vente',
  qty: 2,
  date: '2026-05-04',
  unitPrice: 50,
  lineTotal: 100,
  clientName: 'Client A',
  paymentMethod: 'cash',
  soldAt: '2026-05-04T12:00:00.000Z',
  stockLinked: true,
});
st.transactions.push({
  id: 'r1',
  type: 'rentree',
  date: '2026-05-04',
  amount: 100,
  category: 'vente',
  label: `Vente ${saleNum}`,
  saleNumber: saleNum,
  stockLinked: true,
});
const inv = computeInventory(st);
const row = inv.find((r) => r.id === prod.id);
assert(row && row.remaining === 8, 'stock restant après vente (10-2)');

// Vente prêt
console.log('\nPrêt client');
const pretNum = 'V-2026-00002';
st.stockMovements.push({
  id: 'v2',
  saleNumber: pretNum,
  productId: prod.id,
  type: 'vente',
  qty: 1,
  date: '2026-05-05',
  unitPrice: 75,
  lineTotal: 75,
  clientName: 'Marie Dupont',
  paymentMethod: 'pret',
  soldAt: '2026-05-05T12:00:00.000Z',
  stockLinked: true,
});
assert(getOpenPretSales(st).length >= 1, 'vente prêt ouverte');
assert(pretByClient(st).some((c) => c.clientName === 'Marie Dupont'), 'client prêt dans sommaire');
const settle = settlePretSale(st, pretNum, '2026-05-10', '');
assert(settle.ok && settle.needsRentree, 'encaissement prêt prêt pour rentrée');

// Panier validation
console.log('\nPanier');
assert(validateCartCheckout([], '').ok === false, 'panier vide refusé');
assert(validateCartCheckout([{ qty: 1, unitPrice: 10 }], 'Jean').ok, 'panier + acheteur OK');

// Reçu
console.log('\nReçu');
const sale = groupSales(st).find((s) => s.saleNumber === saleNum);
const html = buildReceiptHtml(st, { ...sale, sellerName: 'Vendeur' });
assert(html.includes(BUSINESS_NAME), 'reçu affiche Manoue Bar');

// Audit stock/finance
console.log('\nAudit');
const alerts = auditStockFinance(st);
assert(Array.isArray(alerts), 'audit retourne un tableau');

// Totaux
console.log('\nRapports');
const totals = computeTotals(st.transactions, '2026-01-01', '2026-12-31');
assert(totals.rentrees >= 100, 'totaux rentrées calculés');
assert(typeof balanceAt(st.transactions) === 'number', 'solde cumulé calculé');

console.log(`\n=== Résultat: ${passed} OK, ${failed} échec(s) ===\n`);
process.exit(failed ? 1 : 0);
