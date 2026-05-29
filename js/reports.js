import { formatMoney, formatDate, displayBusinessName } from './storage.js';

export function computeTotals(transactions, fromDate, toDate) {
  const filtered = transactions.filter((t) => {
    if (fromDate && t.date < fromDate) return false;
    if (toDate && t.date > toDate) return false;
    return true;
  });

  const rentrees = filtered
    .filter((t) => t.type === 'rentree')
    .reduce((s, t) => s + Number(t.amount), 0);
  const sorties = filtered
    .filter((t) => t.type === 'sortie')
    .reduce((s, t) => s + Number(t.amount), 0);

  return {
    rentrees,
    sorties,
    net: rentrees - sorties,
    count: filtered.length,
    items: filtered.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export function balanceAt(transactions) {
  return transactions.reduce((bal, t) => {
    const n = Number(t.amount);
    return t.type === 'rentree' ? bal + n : bal - n;
  }, 0);
}

export function periodBounds(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  if (period === 'jour') {
    const iso = now.toISOString().slice(0, 10);
    return { from: iso, to: iso, label: 'Journalier' };
  }

  if (period === 'mois') {
    const from = new Date(y, m, 1).toISOString().slice(0, 10);
    const to = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    return { from, to, label: 'Mensuel' };
  }

  const from = `${y}-01-01`;
  const to = now.toISOString().slice(0, 10);
  return { from, to, label: 'Annuel' };
}

export function buildReportJson(state, period) {
  const { from, to, label } = periodBounds(period);
  const totals = computeTotals(state.transactions, from, to);

  return {
    meta: {
      app: 'État financier',
      generatedAt: new Date().toISOString(),
      period: label,
      from,
      to,
      business: displayBusinessName(state.profile),
    },
    resume: {
      rentrees: totals.rentrees,
      sorties: totals.sorties,
      net: totals.net,
      soldeCumule: balanceAt(state.transactions),
      operations: totals.count,
    },
    transactions: totals.items.map((t) => ({
      date: t.date,
      type: t.type,
      category: t.category,
      label: t.label,
      amount: Number(t.amount),
    })),
  };
}

export function buildReportMarkdown(state, period) {
  const data = buildReportJson(state, period);
  const lines = [
    `# Rapport ${data.meta.period} — ${data.meta.business}`,
    ``,
    `Période : **${data.meta.from}** → **${data.meta.to}**`,
    `Généré : ${new Date(data.meta.generatedAt).toLocaleString('fr-CA')}`,
    ``,
    `## Résumé`,
    ``,
    `| Indicateur | Montant |`,
    `|------------|---------|`,
    `| Rentrées | ${formatMoney(data.resume.rentrees)} |`,
    `| Sorties | ${formatMoney(data.resume.sorties)} |`,
    `| Résultat net (période) | ${formatMoney(data.resume.net)} |`,
    `| Solde cumulé | ${formatMoney(data.resume.soldeCumule)} |`,
    `| Opérations | ${data.resume.operations} |`,
    ``,
    `## Détail des opérations`,
    ``,
  ];

  if (!data.transactions.length) {
    lines.push(`_Aucune opération sur cette période._`);
  } else {
    lines.push(`| Date | Type | Catégorie | Libellé | Montant |`);
    lines.push(`|------|------|-----------|---------|---------|`);
    for (const t of data.transactions) {
      const sign = t.type === 'rentree' ? '+' : '−';
      lines.push(
        `| ${t.date} | ${t.type} | ${t.category} | ${t.label} | ${sign}${formatMoney(t.amount)} |`
      );
    }
  }

  lines.push(``, `---`, `*Rapport État financier — à valider avec votre comptable.*`);
  return lines.join('\n');
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
