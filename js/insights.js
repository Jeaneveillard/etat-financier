import { formatMoney } from './storage.js';
import { computeTotals, periodBounds } from './reports.js';

/**
 * Recommandations pédagogiques pour le responsable.
 */
export function generateInsights(state) {
  const { from, to } = periodBounds('mois');
  const month = computeTotals(state.transactions, from, to);
  const prevFrom = shiftMonth(from, -1);
  const prevTo = shiftMonth(to, -1);
  const prev = computeTotals(state.transactions, prevFrom, prevTo);

  const ideas = [];

  if (new Date().getDay() === 0) {
    ideas.push({
      title: 'Dimanche — Soupe giromon',
      body: 'Enregistrez les portions de Soup jounou vendues dans Reçus / Ventes (produit « Soupe giromon »).',
      priority: 'haute',
    });
  }

  if (month.net < 0) {
    ideas.push({
      title: 'Marge mensuelle négative',
      body: `Les sorties (${formatMoney(month.sorties)}) dépassent les rentrées (${formatMoney(month.rentrees)}). Identifiez 2 postes de dépenses à réduire ou relancez les ventes cette semaine.`,
      priority: 'haute',
    });
  }

  if (month.rentrees > 0 && prev.rentrees > 0) {
    const growth = ((month.rentrees - prev.rentrees) / prev.rentrees) * 100;
    if (growth < -10) {
      ideas.push({
        title: 'Baisse des ventes',
        body: `Les rentrées ont chuté d'environ ${Math.abs(growth).toFixed(0)} % vs le mois précédent. Analysez le marché local et vos prix.`,
        priority: 'moyenne',
      });
    } else if (growth > 15) {
      ideas.push({
        title: 'Croissance des rentrées',
        body: `+${growth.toFixed(0)} % de rentrées vs le mois dernier — bon moment pour réinvestir prudemment (équipement, formation).`,
        priority: 'positive',
      });
    }
  }

  const achats = month.items.filter((t) => t.type === 'sortie' && t.category === 'achat');
  const ventes = month.items.filter(
    (t) => t.type === 'rentree' && (t.category === 'vente' || t.category === 'repas')
  );
  if (achats.length > ventes.length * 2 && ventes.length > 0) {
    ideas.push({
      title: 'Achats vs ventes',
      body: 'Beaucoup d\'achats par rapport aux ventes enregistrées — vérifiez les stocks et les délais de paiement fournisseurs.',
      priority: 'moyenne',
    });
  }

  if (!state.employees.length && month.sorties > 3000) {
    ideas.push({
      title: 'Paie non modélisée',
      body: 'Aucun employé enregistré alors que les sorties sont élevées. Ajoutez la paie pour estimer le revenu net réel après impôts et cotisations.',
      priority: 'moyenne',
    });
  }

  const pretSales = new Set(
    (state.stockMovements || [])
      .filter(
        (m) =>
          m.type === 'vente' &&
          (m.paymentMethod === 'pret' || m.paymentMethod === 'credit') &&
          m.date >= from &&
          m.date <= to
      )
      .map((m) => m.saleNumber)
  );
  if (pretSales.size > 0) {
    ideas.push({
      title: 'Ventes en prêt',
      body: `${pretSales.size} vente(s) en prêt ce mois — voir l'onglet Clients en prêt pour encaisser.`,
      priority: 'moyenne',
    });
  }

  if (!ideas.length) {
    ideas.push({
      title: 'Situation stable',
      body: 'Aucune alerte majeure ce mois. Continuez à saisir chaque rentrée et sortie le jour même pour éviter les erreurs.',
      priority: 'positive',
    });
  }

  return ideas;
}

function shiftMonth(iso, delta) {
  const d = new Date(iso + 'T12:00:00');
  d.setMonth(d.getMonth() + delta);
  return d.toISOString().slice(0, 10);
}
