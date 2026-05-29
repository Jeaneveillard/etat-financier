import { formatMoney, formatDate, formatDateTime, displayBusinessName } from './storage.js';

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'pret', label: 'Prêt (crédit)' },
];

const PAYMENT_LABELS = {
  cash: 'Cash',
  pret: 'Prêt',
  comptant: 'Cash',
};

export function paymentLabel(value) {
  if (PAYMENT_LABELS[value]) return PAYMENT_LABELS[value];
  return PAYMENT_METHODS.find((p) => p.value === value)?.label || value || '—';
}

export function normalizePaymentMethod(value) {
  if (value === 'comptant' || value === 'cash') return 'cash';
  if (value === 'pret') return 'pret';
  return 'cash';
}

export function nextSaleNumber(state) {
  const year = new Date().getFullYear();
  if (!state.profile.saleCounters) state.profile.saleCounters = {};
  const n = (state.profile.saleCounters[year] || 0) + 1;
  state.profile.saleCounters[year] = n;
  return `V-${year}-${String(n).padStart(5, '0')}`;
}

export function lineTotal(qty, unitPrice) {
  return Math.round(Number(qty) * Number(unitPrice) * 100) / 100;
}

export function computeReceiptTotals(subtotal) {
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
        <td data-label="Description">${escapeHtml(ln.productName)}</td>
        <td class="num" data-label="Qté">${ln.qty} ${escapeHtml(ln.unit || '')}</td>
        <td class="num" data-label="Prix unit.">${formatMoney(ln.unitPrice)}</td>
        <td class="num" data-label="Montant">${formatMoney(ln.lineTotal)}</td>
      </tr>`
    )
    .join('');
}

export function buildReceiptHtml(state, sale) {
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

export function printReceipt(state, sale) {
  const html = buildReceiptHtml(state, sale);
  const w = window.open('', '_blank', 'width=440,height=800');
  if (!w) {
    alert('Autorisez les fenêtres pop-up pour imprimer le reçu.');
    return;
  }
  w.document.write(html);
  w.document.close();
}

export function movementToReceiptLine(state, mov) {
  const product = (state.products || []).find((p) => p.id === mov.productId);
  return {
    productName: product?.name || 'Produit',
    unit: product?.unit || 'unité',
    qty: mov.qty,
    unitPrice: mov.unitPrice ?? 0,
    lineTotal: mov.lineTotal ?? lineTotal(mov.qty, mov.unitPrice || 0),
  };
}

export function saleToReceipt(state, saleGroup) {
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
export function movementToReceipt(state, mov) {
  return saleToReceipt(state, {
    ...mov,
    lines: [mov],
    lineTotal: mov.lineTotal,
  });
}
