import { formatMoney } from './storage.js';
import { periodBounds, computeTotals } from './reports.js';

export const TAX_KINDS = [
  { value: 'tps', label: 'Taxe 7 % — remise au gouvernement' },
  { value: 'autre-tax', label: 'Autre taxe gouvernementale' },
];

export function isOwnerTaxPayment(tx) {
  return tx.type === 'sortie' && (tx.category === 'taxes' || tx.taxKind);
}

function filterByPeriod(items, from, to) {
  return items.filter((t) => {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    return true;
  });
}

export function taxCollected(transactions, from, to) {
  const items = filterByPeriod(transactions, from, to).filter(
    (t) => t.type === 'rentree' && (t.tpsAmount || t.tvqAmount)
  );
  return items.reduce(
    (acc, t) => ({
      tax: acc.tax + (Number(t.tpsAmount) || 0) + (Number(t.tvqAmount) || 0),
      count: acc.count + 1,
    }),
    { tax: 0, count: 0 }
  );
}

/** @deprecated */
export function tpsTvqCollected(transactions, from, to) {
  const c = taxCollected(transactions, from, to);
  return { tps: c.tax, tvq: 0, count: c.count };
}

export function ownerTaxPaid(transactions, from, to) {
  const items = filterByPeriod(transactions, from, to).filter(isOwnerTaxPayment);
  const byKind = {};
  for (const k of TAX_KINDS) byKind[k.value] = 0;

  let total = 0;
  for (const t of items) {
    const amt = Number(t.amount) || 0;
    total += amt;
    const kind = t.taxKind || 'autre-tax';
    byKind[kind] = (byKind[kind] || 0) + amt;
  }

  return { total, byKind, items: items.sort((a, b) => b.date.localeCompare(a.date)) };
}

export function computeTaxSummary(state, period) {
  const { from, to, label } = periodBounds(period);
  const monthTotals = computeTotals(state.transactions, from, to);
  const collected = taxCollected(state.transactions, from, to);
  const paid = ownerTaxPaid(state.transactions, from, to);
  const collectedTotal = collected.tax;
  const netAfterOwnerTax = monthTotals.net - paid.total;

  return {
    period: label,
    from,
    to,
    collected,
    collectedTotal,
    paid,
    monthNet: monthTotals.net,
    netAfterOwnerTax,
    toRemitEstimate: Math.max(0, collectedTotal - (paid.byKind.tps || 0)),
  };
}

export function taxKindLabel(value) {
  return TAX_KINDS.find((k) => k.value === value)?.label || value || '—';
}

export function buildTaxReportMarkdown(summary, state) {
  const p = summary.paid;
  const c = summary.collected;
  const cur = state.profile?.currency;
  const lines = [
    `## Taxes — ${summary.period}`,
    ``,
    `### Perçues sur les ventes (taxe 7 %)`,
    `| | Montant |`,
    `|---|---------|`,
    `| Taxe perçue | ${formatMoney(c.tax, cur)} |`,
    `| **Total perçu** | **${formatMoney(summary.collectedTotal, cur)}** |`,
    ``,
    `### Payées par le propriétaire`,
    `| Type | Montant |`,
    `|------|---------|`,
  ];
  for (const k of TAX_KINDS) {
    if (p.byKind[k.value] > 0) {
      lines.push(`| ${k.label} | ${formatMoney(p.byKind[k.value], cur)} |`);
    }
  }
  lines.push(`| **Total taxes payées** | **${formatMoney(p.total, cur)}** |`);
  lines.push(
    ``,
    `Résultat net (période) : ${formatMoney(summary.monthNet, cur)}`,
    ``,
    `**Revenu net après taxes** : ${formatMoney(summary.netAfterOwnerTax, cur)}`,
    ``,
    `Estimation à remettre : ${formatMoney(summary.toRemitEstimate, cur)}`
  );
  return lines.join('\n');
}
