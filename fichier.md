# Fichier de suivi des Skills et Corrections (fichier.md)

Ce fichier sert de plan de vol pour l'application des "skills" techniques visant à corriger l'application "État financier".

## 📋 Checklist des Corrections à appliquer

### 1. Sécurisation du stockage local (Storage Skill)
- [ ] Analyser `storage.js` pour s'assurer que les données financières sont bien encodées/décodées de manière sécurisée en JSON.
- [ ] Gérer les cas où le `localStorage` est plein ou corrompu (fallback, message d'erreur clair).
- [ ] Implémenter une fonction d'export/import de sauvegarde fiable.

### 2. Gestion des Erreurs Globales (Error Handling Skill)
- [ ] Encapsuler les fonctions critiques dans des blocs `try...catch`.
- [ ] Créer un composant ou un gestionnaire d'affichage des erreurs pour l'utilisateur final.
- [ ] Prévenir les crashs liés aux calculs de montants vides ou `NaN`.

### 3. Cohérence Architecturale (Architecture Skill)
- [ ] Le `bundle.js` existe déjà, s'assurer que le script de build (`build-bundle.ps1`) compile correctement les fichiers du dossier `js/` de manière fluide.
- [ ] Séparer les responsabilités : UI (manipulation du DOM), Logique métier (calculs financiers), et Données (sauvegarde/récupération).

### 4. Optimisation des Rapports (Reporting Skill)
- [ ] Vérifier la génération des exports en JSON et Markdown.
- [ ] S'assurer que les rapports journaliers et mensuels filtrent correctement les transactions par date.

---

> **Note au développeur/agent** : Utilisez ce fichier comme guide étape par étape. Chaque fois qu'une compétence (skill) est appliquée pour corriger un bug, cochez la case correspondante et documentez brièvement la solution apportée.
