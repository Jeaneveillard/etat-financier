export const firebaseConfig = {
  apiKey: "AIzaSyCXzw_D2QRU6Ol2gSotCAuJOVZgSlc6UNM",
  authDomain: "etat-financier.firebaseapp.com",
  projectId: "etat-financier",
  storageBucket: "etat-financier.firebasestorage.app",
  messagingSenderId: "1052031698951",
  appId: "1:1052031698951:web:f2e05e880898c15d7c02a2"
};

let db = null;

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
    if (err.code == 'failed-precondition') {
      console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
    } else if (err.code == 'unimplemented') {
      console.warn("The current browser does not support offline persistence.");
    }
  });
}

/**
 * Pousse l'état local complet vers le Cloud Firebase.
 */
export async function pushToCloud(state) {
  if (!db || !state || !state.updatedAt) return;
  try {
    const docRef = db.collection("appData").doc("state");
    await docRef.set(state);
    console.log("[Firebase] État poussé vers le Cloud avec succès.");
  } catch (err) {
    console.error("[Firebase] Erreur lors de la synchronisation :", err);
  }
}

/**
 * Écoute les changements provenant du Cloud.
 */
export function listenToCloud(currentLocalUpdatedAt, onCloudUpdate) {
  if (!db) return;
  
  const docRef = db.collection("appData").doc("state");
  docRef.onSnapshot((docSnap) => {
    if (docSnap.exists) {
      const cloudState = docSnap.data();
      const cloudDate = new Date(cloudState.updatedAt || 0).getTime();
      const localDate = new Date(currentLocalUpdatedAt || 0).getTime();

      if (cloudDate > localDate) {
        console.log("[Firebase] Mise à jour Cloud détectée. Application...");
        onCloudUpdate(cloudState);
      }
    }
  });
}
