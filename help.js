/** Menu Aide — sommaire puis une section à la fois */

const HELP_SECTIONS = [
  {
    id: 'demarrage',
    num: 1,
    title: 'Démarrage',
    body: `
  <p>Cette application sert à suivre l'argent, le stock et les ventes de <strong>Manoue Bar</strong> (Haïti, gourdes HTG, sans taxe sur les ventes).</p>
  <ol class="help-steps">
    <li>Double-cliquez <strong>Lancer Etat financier.bat</strong> (ou <strong>OUVRIR Etat financier.bat</strong>).</li>
    <li>L'app s'ouvre dans le navigateur (Chrome ou Safari recommandés).</li>
    <li>Sur téléphone : copiez le dossier complet sur l'appareil ou utilisez le navigateur du même réseau.</li>
    <li>Ne supprimez pas le dossier <strong>js</strong> ni <strong>css</strong> — l'app en a besoin.</li>
  </ol>
  <p class="help-note">Toutes les données restent sur <strong>votre appareil</strong> (localStorage). Faites des exports JSON réguliers en secours.</p>`,
  },
  {
    id: 'entete',
    num: 2,
    title: 'En-tête et indicateurs',
    body: `
  <p>En haut de chaque écran, vous voyez le nom <strong>Manoue Bar</strong> et cinq chiffres :</p>
  <dl class="help-dl">
    <dt>Solde cumulé</dt>
    <dd>Tout l'argent entré moins tout l'argent sorti, depuis le début.</dd>
    <dt>Net ce mois</dt>
    <dd>Rentrées du mois − sorties du mois.</dd>
    <dt>Rentrées (mois)</dt>
    <dd>Total des entrées d'argent ce mois (ventes cash, encaissements prêt, autres rentrées).</dd>
    <dt>Sorties (mois)</dt>
    <dd>Total des dépenses ce mois (achats stock, salaires, loyer, etc.).</dd>
    <dt>Paie nette (mois)</dt>
    <dd>Estimation du net à payer aux employés enregistrés (onglet Paie).</dd>
  </dl>
  <p>Les menus se choisissent dans la barre d'onglets juste en dessous. Sur mobile, faites glisser horizontalement pour voir tous les onglets.</p>`,
  },
  {
    id: 'tableau',
    num: 3,
    title: 'Tableau de bord',
    body: `
  <h4>Alertes — prévenir les erreurs</h4>
  <p>Liste automatique des problèmes à corriger :</p>
  <ul>
    <li>Solde négatif ou sorties supérieures aux rentrées du mois.</li>
    <li>Écart entre le stock et les opérations financières liées.</li>
    <li>Stock bas ou vente impossible (stock insuffisant).</li>
    <li>Prêts clients en attente d'encaissement.</li>
  </ul>
  <p>Consultez cette section <strong>chaque soir</strong> avant de fermer.</p>
  <h4>Recommandations &amp; marché</h4>
  <p>Conseils générés selon votre activité (marge, stock, prêts). Aide à décider quoi réapprovisionner ou surveiller.</p>`,
  },
  {
    id: 'operations',
    num: 4,
    title: 'Opérations',
    body: `
  <p>Pour les entrées et sorties d'argent <strong>qui ne passent pas par une vente ou un achat stock</strong> (loyer, salaire manuel, subvention, etc.).</p>
  <h4>Formulaire « Nouvelle opération »</h4>
  <dl class="help-dl">
    <dt>Type</dt>
    <dd><strong>Rentrée</strong> = argent reçu. <strong>Sortie</strong> = argent dépensé.</dd>
    <dt>Date</dt>
    <dd>Date réelle de l'opération (pas dans le futur).</dd>
    <dt>Montant ($)</dt>
    <dd>Montant en gourdes. Doit être supérieur à 0 pour enregistrer.</dd>
    <dt>Catégorie</dt>
    <dd>Classe l'opération (vente, repas, service, salaire, loyer, fournisseur, etc.).</dd>
    <dt>Libellé</dt>
    <dd>Description courte (ex. « Loyer mai », « Facture électricité »).</dd>
    <dt>Case sortie &gt; 5 000 $</dt>
    <dd>À cocher pour confirmer une grosse sortie (avertissement).</dd>
    <dt>Enregistrer</dt>
    <dd>Valide l'opération. Le solde se met à jour tout de suite.</dd>
  </dl>
  <p class="help-warn"><strong>Interdit ici :</strong> achats de marchandise (→ Produits/Stock) et rentrées de vente produit (→ Reçus/Ventes). Le système vous bloquera.</p>
  <h4>Journal des opérations</h4>
  <p>Tableau de toutes les opérations. Colonnes : Date, Type, Catégorie, Libellé, Montant.</p>
  <ul>
    <li><strong>Modif.</strong> — corriger une opération manuelle (pas les lignes liées au stock).</li>
    <li><strong>Suppr.</strong> — effacer une opération (confirmation demandée).</li>
    <li>Les lignes avec badge <strong>auto</strong> viennent du stock : modifiez via Stock ou Reçus.</li>
  </ul>
  <h4>Plan rapide</h4>
  <p>Rappel : saisie le jour même, vérification des alertes, export en fin de journée.</p>`,
  },
  {
    id: 'recu',
    num: 5,
    title: 'Reçus / Ventes',
    body: `
  <p>C'est l'onglet principal pour <strong>vendre</strong> et imprimer un reçu au client si vous le souhaitez.</p>
  <p class="help-warn"><strong>Règle d'or :</strong> remplir le panier ne suffit pas. Il faut cliquer <strong>Payer</strong> (cash) ou <strong>Enregistrer le prêt</strong> (crédit) pour que la vente compte.</p>
  <h4>Gestion des produits</h4>
  <dl class="help-dl">
    <dt>Nom du produit</dt>
    <dd>Ex. Coca-Cola, Soupe giromon, Prestige.</dd>
    <dt>Unité de vente</dt>
    <dd>Bouteille, portion, verre, etc.</dd>
    <dt>Achat stock</dt>
    <dd>Unité fournisseur (caisse, sac…) et contenu par achat.</dd>
  </dl>
  <h4>Panier</h4>
  <ol class="help-steps">
    <li>Choisissez <strong>Produit</strong>, vérifiez le stock disponible.</li>
    <li>Saisissez <strong>Quantité</strong> et <strong>Prix unitaire</strong>.</li>
    <li>Cliquez <strong>+ Ajouter au panier</strong>.</li>
  </ol>
  <h4>Payer et enregistrer</h4>
  <dl class="help-dl">
    <dt>Nom de l'acheteur</dt>
    <dd><strong>Obligatoire.</strong></dd>
    <dt>Paiement Cash</dt>
    <dd>Sortie stock + rentrée d'argent.</dd>
    <dt>Paiement Prêt</dt>
    <dd>Sortie stock seulement — encaisser plus tard dans Clients en prêt.</dd>
    <dt>Imprimer le reçu</dt>
    <dd>Optionnel pour le client.</dd>
  </dl>
  <h4>Liste des reçus</h4>
  <p><strong>Reçu</strong>, <strong>Modif.</strong>, <strong>Suppr.</strong> sur chaque vente enregistrée.</p>`,
  },
  {
    id: 'pret',
    num: 6,
    title: 'Clients en prêt',
    body: `
  <p>Clients qui ont acheté en <strong>Prêt (crédit)</strong> sans encore rembourser.</p>
  <p class="help-note">Pas de liste séparée : saisissez le <strong>Nom de l'acheteur</strong> à chaque vente. Utilisez toujours le même nom pour un même client.</p>
  <h4>Sommaire par client</h4>
  <p>Nombre de ventes en prêt et <strong>total dû</strong> par client.</p>
  <h4>Ventes en attente</h4>
  <ol class="help-steps">
    <li>Cliquez <strong>Encaisser</strong> quand le client paie.</li>
    <li>La rentrée est créée dans Opérations.</li>
    <li>La vente passe dans « Prêts déjà encaissés ».</li>
  </ol>`,
  },
  {
    id: 'stock',
    num: 7,
    title: 'Produits / Stock',
    body: `
  <h4>Inventaire</h4>
  <ul>
    <li><strong>Acheté</strong> — entrées fournisseur.</li>
    <li><strong>Vendu</strong> — sorties par ventes.</li>
    <li><strong>Restant</strong> — stock actuel.</li>
  </ul>
  <h4>Achat fournisseur</h4>
  <p>Chaque achat augmente le stock <strong>et</strong> crée une sortie dans Opérations (montant obligatoire).</p>
  <dl class="help-dl">
    <dt>Quantité / Date / Note</dt>
    <dd>Détails de l'achat.</dd>
    <dt>Montant payé (Gdes)</dt>
    <dd>Coût total → sortie auto liée.</dd>
  </dl>
  <p><strong>Modif.</strong> ou <strong>Suppr.</strong> un achat met à jour stock et sortie ensemble.</p>`,
  },
  {
    id: 'paie',
    num: 8,
    title: 'Paie',
    body: `
  <h4>Ajouter un employé</h4>
  <dl class="help-dl">
    <dt>Nom / Rôle</dt>
    <dd>Identification de l'employé.</dd>
    <dt>Salaire brut mensuel</dt>
    <dd>En gourdes (&gt; 0 pour enregistrer).</dd>
  </dl>
  <p>Tableau : brut, retenues, net. <strong>Modif.</strong> / <strong>Suppr.</strong> par ligne.</p>
  <p class="help-note">Retenues à 0 par défaut (Haïti). Pour payer un salaire : <strong>Sortie</strong> catégorie Salaire dans Opérations.</p>`,
  },
  {
    id: 'rapports',
    num: 9,
    title: 'Rapports',
    body: `
  <dl class="help-dl">
    <dt>Période</dt>
    <dd>Journalier, mensuel ou annuel.</dd>
    <dt>Exporter JSON</dt>
    <dd>Sauvegarde structurée.</dd>
    <dt>Exporter Markdown</dt>
    <dd>Rapport lisible à imprimer.</dd>
    <dt>Aperçu</dt>
    <dd>Rentrées, sorties, net, solde, détail des opérations.</dd>
  </dl>`,
  },
  {
    id: 'parametres',
    num: 10,
    title: 'Paramètres',
    body: `
  <h4>Entreprise</h4>
  <dl class="help-dl">
    <dt>Nom du business</dt>
    <dd>Manoue Bar (en-tête et reçus).</dd>
    <dt>Vendeur / Adresse / Téléphone</dt>
    <dd>Sur les reçus clients.</dd>
  </dl>
  <h4>Sauvegarde</h4>
  <ul>
    <li><strong>Importer JSON</strong> — restaurer une sauvegarde.</li>
    <li><strong>Charger démo</strong> — exemple de test.</li>
    <li><strong>Nettoyer produits obsolètes</strong>.</li>
    <li><strong>Remettre tout à zéro</strong> — efface tout (exportez avant).</li>
  </ul>`,
  },
  {
    id: 'regles',
    num: 11,
    title: 'Règles importantes',
    body: `
  <table class="help-table">
    <thead><tr><th>Action</th><th>Où</th><th>Effet auto</th></tr></thead>
    <tbody>
      <tr><td>Achat marchandise</td><td>Stock → Achat</td><td>Stock + ; sortie Opérations</td></tr>
      <tr><td>Vente cash</td><td>Reçus → Payer</td><td>Stock − ; rentrée</td></tr>
      <tr><td>Vente prêt</td><td>Reçus → Enregistrer le prêt</td><td>Stock − ; encaisser plus tard</td></tr>
      <tr><td>Encaisser prêt</td><td>Clients en prêt</td><td>Rentrée Opérations</td></tr>
      <tr><td>Loyer, salaire…</td><td>Opérations</td><td>Sortie ou rentrée manuelle</td></tr>
    </tbody>
  </table>
  <p>Pas de taxe sur les ventes (Haïti).</p>`,
  },
  {
    id: 'quotidien',
    num: 12,
    title: 'Routine quotidienne',
    body: `
  <ol class="help-steps">
    <li><strong>Matin</strong> — Achats fournisseur (Stock) si livraison.</li>
    <li><strong>Service</strong> — Panier → Payer ou Prêt pour chaque vente.</li>
    <li><strong>Dimanche</strong> — Soupe giromon en portion ; prêt possible.</li>
    <li><strong>Soir</strong> — Tableau de bord : alertes.</li>
    <li><strong>Semaine</strong> — Exporter JSON en sauvegarde.</li>
  </ol>`,
  },
  {
    id: 'faq',
    num: 13,
    title: 'Questions fréquentes',
    body: `
  <dl class="help-dl">
    <dt>Le panier ne diminue pas le stock</dt>
    <dd>Cliquez <strong>Payer</strong> ou <strong>Enregistrer le prêt</strong>.</dd>
    <dt>Sortie « achat » bloquée</dt>
    <dd>Utilisez Stock → Achat, pas Opérations.</dd>
    <dt>Stock négatif</dt>
    <dd>Enregistrez un achat ou corrigez la vente.</dd>
    <dt>Nom Manoue Bar absent</dt>
    <dd>Paramètres → Enregistrer → Ctrl+F5.</dd>
    <dt>Données perdues</dt>
    <dd>Paramètres → Importer JSON.</dd>
    <dt>Client en prêt</dt>
    <dd>Reçus → Nom acheteur + Prêt → Enregistrer le prêt.</dd>
  </dl>`,
  },
];

function sectionById(id) {
  return HELP_SECTIONS.find((s) => s.id === id);
}

function showHelpIndex(container) {
  const items = HELP_SECTIONS.map(
    (s) =>
      `<li><button type="button" class="help-menu__item" data-help-id="${s.id}"><span class="help-menu__num">${s.num}</span><span class="help-menu__label">${s.title}</span></button></li>`
  ).join('');
  container.innerHTML = `
    <nav class="help-menu" aria-label="Sommaire de l'aide">
      <p class="help-menu__intro">Choisissez un sujet pour voir les instructions détaillées.</p>
      <ul class="help-menu__list">${items}</ul>
    </nav>`;
}

function showHelpSection(container, id) {
  const sec = sectionById(id);
  if (!sec) {
    showHelpIndex(container);
    return;
  }
  container.innerHTML = `
    <div class="help-detail">
      <button type="button" class="btn btn--ghost help-back" data-help-back>← Retour au sommaire</button>
      <article class="help-section help-section--solo">
        <h3>${sec.num}. ${sec.title}</h3>
        ${sec.body}
      </article>
    </div>`;
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindHelpNav(container) {
  if (container.dataset.helpBound === '1') return;
  container.dataset.helpBound = '1';
  container.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-help-id]');
    if (pick) {
      showHelpSection(container, pick.dataset.helpId);
      return;
    }
    if (e.target.closest('[data-help-back]')) {
      showHelpIndex(container);
    }
  });
}

export function renderHelpContent(container) {
  if (!container) return;
  bindHelpNav(container);
  showHelpIndex(container);
}

export function resetHelpView(container) {
  if (container) showHelpIndex(container);
}
