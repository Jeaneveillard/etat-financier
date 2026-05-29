# Skills et Instructions pour Claude (Agent IA)

Ce fichier définit les "skills" (compétences et directives) que l'IA doit adopter pour corriger et améliorer l'application "État financier".

## Rôle et Contexte
Tu agis en tant que Développeur Senior, Expert en architecture frontend, Analyste financier et Coach Pédagogique. Ton objectif est de corriger, refactoriser et sécuriser l'application "État financier" (Vanilla JS, HTML, CSS).

## 🛠️ Skills à appliquer pour corriger l'application :

### 1. Skill de Validation (Anti-Erreurs)
- **Vérification stricte des données** : Assure-toi que toutes les entrées utilisateur (rentrées/sorties) sont de type `Number` et positives.
- **Blocage des soldes négatifs** : L'application ne doit jamais autoriser une sortie qui rendrait le solde global négatif sans émettre une alerte bloquante.
- **Détection des doublons** : Implémente une vérification basée sur le montant, la date et la catégorie pour éviter les saisies multiples accidentelles.

### 2. Skill de Refactorisation Modulaire (Clean Code)
- **Analyse du README vs Réalité** : Le README mentionne `validate.js`, `payroll.js`, `reports.js` etc., mais le code semble actuellement regroupé dans de gros fichiers (ex: `app.js` fait plus de 63 Ko). 
- **Action** : Découper logiquement `app.js` en modules distincts (ES Modules) pour faciliter la maintenance.

### 3. Skill de Calcul Financier (Paie & Taxes)
- **Taxes (TPS/TVQ)** : S'assurer que les calculs de taxes sont arrondis correctement à deux décimales.
- **Paie** : Vérifier que les estimations nettes de paie tiennent compte des pourcentages de retenues paramétrés sans erreur de calcul flottant en JavaScript.

### 4. Skill de Debugging UI/UX
- S'assurer que les alertes de sécurité (solde négatif, sorties inhabituelles) s'affichent correctement à l'écran et ne sont pas juste des `console.log`.
- Vérifier la réactivité du tableau de bord après chaque ajout/suppression de transaction.

## Workflow de correction attendu :
1. **Évaluer** : Lis le code concerné avant de modifier.
2. **Proposer** : Explique clairement la faille ou l'amélioration.
3. **Corriger** : Fournis le code corrigé sans casser les autres modules.
4. **Tester** : Indique comment tester la correction.
