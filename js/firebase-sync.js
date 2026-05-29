export const firebaseConfig = {
  apiKey: "AIzaSyCXzw_D2QRU6Ol2gSotCAuJOVZgSlc6UNM",
  authDomain: "etat-financier.firebaseapp.com",
  projectId: "etat-financier",
  storageBucket: "etat-financier.firebasestorage.app",
  messagingSenderId: "1052031698951",
  appId: "1:1052031698951:web:f2e05e880898c15d7c02a2"
};

let db = null;
let syncPassword = null;
export let isCloudReady = false;

export function initFirebaseSync() {
  if (typeof firebase === 'undefined') {
    console.error("[Firebase] Le SDK Firebase n'est pas chargé dans index.html.");
    return;
  }
  
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  
  db = firebase.firestore();

  // Activer le mode hors-ligne
  db.enablePersistence().catch((err) => {
    console.warn("[Firebase] Persistance hors ligne non disponible :", err.code);
  });

  // Gestion du mot de passe de sécurité
  syncPassword = localStorage.getItem('etat_financier_sync_pwd');
  if (!syncPassword) {
    syncPassword = prompt("Veuillez entrer le mot de passe de synchronisation pour sécuriser l'accès :");
    if (syncPassword) {
      localStorage.setItem('etat_financier_sync_pwd', syncPassword);
    } else {
      alert("Sans mot de passe, la synchronisation avec Haïti ne fonctionnera pas.");
    }
  }
}

/**
 * Pousse l'état local complet vers le Cloud Firebase.
 */
export async function pushToCloud(state) {
  if (!db || !state || !state.updatedAt || !syncPassword) return;
  if (!isCloudReady) {
    console.log("[Firebase] Ignoré : Le cloud n'est pas encore prêt (pour éviter d'écraser les données).");
    return;
  }
  try {
    const docRef = db.collection("appData").doc(syncPassword);
    await docRef.set(state);
    console.log("[Firebase] État poussé vers le Cloud avec succès.");
  } catch (err) {
    console.error("[Firebase] Erreur lors de la synchronisation (vérifiez le mot de passe) :", err);
  }
}

/**
 * Écoute les changements provenant du Cloud.
 */
export function listenToCloud(currentLocalUpdatedAt, onCloudUpdate, onCloudReady) {
  if (!db || !syncPassword) {
    if (onCloudReady) onCloudReady();
    return;
  }
  
  const docRef = db.collection("appData").doc(syncPassword);
  
  docRef.onSnapshot((docSnap) => {
    // La première fois que ça répond (depuis le cache ou le serveur), on débloque l'application.
    if (!isCloudReady) {
      isCloudReady = true;
      if (onCloudReady) onCloudReady();
    }

    if (docSnap.exists) {
      const cloudState = docSnap.data();
      const cloudDate = new Date(cloudState.updatedAt || 0).getTime();
      const localDate = new Date(currentLocalUpdatedAt || 0).getTime();

      if (cloudDate > localDate) {
        console.log("[Firebase] Mise à jour Cloud détectée. Application...");
        onCloudUpdate(cloudState);
      }
    }
  }, (error) => {
    console.error("[Firebase] Accès refusé. Le mot de passe est probablement incorrect.", error);
    if (!isCloudReady) {
      isCloudReady = true;
      if (onCloudReady) onCloudReady(); // On débloque quand même l'app, même en cas d'erreur de mot de passe
      alert("Erreur de synchronisation : Mot de passe incorrect ou accès refusé. Effacez les données de navigation pour réessayer.");
    }
  });
}
