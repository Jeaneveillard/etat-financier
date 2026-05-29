# État financier

Application locale pour responsables d'entreprise : **rentrées**, **sorties**, validation anti-erreurs, **paie**, **TPS/TVQ**, rapports **journaliers** et **mensuels** (JSON + Markdown).

## Lancer l'application

**Windows** — double-clic sur `Lancer Etat financier.bat`  
**Mac** — `Lancer Etat financier.command`

Ouvrir : [http://127.0.0.1:8776/](http://127.0.0.1:8776/)

Ne pas ouvrir `index.html` en `file://` (modules ES bloqués).

## Fonctionnalités

| Module | Rôle |
|--------|------|
| Tableau de bord | Alertes (solde négatif, sorties > rentrées), recommandations marché |
| Opérations | Saisie rentrées/sorties avec blocage si solde négatif, doublons, grosses sorties |
| Paie | Estimation net employé (retenues QC simplifiées) |
| Rapports | Export journalier / mensuel / annuel en JSON et Markdown |
| Paramètres | Nom entreprise, taux TPS/TVQ, import/export |

## Prompt agent

Le fichier `PROMPT-AGENT.md` reprend le brief agent pour **Cursor** ou **Antigravity**. Application **autonome** : aucune liaison avec d'autres logiciels.

## Structure

```
Etat financier/
  index.html
  css/app.css
  js/
    app.js
    storage.js
    validate.js
    payroll.js
    reports.js
    insights.js
  PROMPT-AGENT.md
  README.md
```

## Avertissement

Les calculs de paie et de taxes sont **pédagogiques**. Validez avec un comptable ou fiscaliste avant toute déclaration officielle.
