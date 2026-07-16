import { getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  updateDoc
} from "firebase/firestore";
import {
  deleteObject,
  getStorage,
  listAll,
  ref,
  type StorageReference
} from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);

/**
 * Firestore with offline persistence: data the app has already loaded
 * (projects, items) stays readable from a local cache with no
 * connection. Writes made while offline are queued automatically and
 * sent once the connection returns. This does NOT cover Storage photo
 * uploads — those still require a live connection.
 *
 * initializeFirestore() throws if it's called twice for the same app
 * (can happen during Next.js hot reload), so fall back to the plain
 * getFirestore() in that case rather than crashing.
 */
function createFirestoreInstance() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch (err) {
    return getFirestore(app);
  }
}

export const db = createFirestoreInstance();
export const storage = getStorage(app);

/**
 * Signs the visitor in anonymously so Firestore/Storage rules see
 * request.auth != null. Used for customers opening a shared project
 * link. Never grants contractor privileges by itself.
 */
export async function ensureAnonymousAuth() {
  if (auth.currentUser) return auth.currentUser;
  const result = await signInAnonymously(auth);
  return result.user;
}

/**
 * Real contractor login. Only accounts that also have a matching
 * document in the `contractors` collection are treated as contractors
 * anywhere in the app — see checkIsContractor().
 */
export async function signInContractor(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  const isContractor = await checkIsContractor(result.user.uid);
  if (!isContractor) {
    await signOut(auth);
    throw new Error("This account is not registered as a contractor.");
  }
  return result.user;
}

export async function signOutContractor() {
  await signOut(auth);
}

/**
 * Source of truth for "is this uid a contractor". Backed by a
 * Firestore document instead of a custom claim so it can be managed
 * entirely from the Firebase console, with no server/Cloud Function
 * required. Firestore rules use the same check server-side.
 */
export async function checkIsContractor(uid: string) {
  const snap = await getDoc(doc(db, "contractors", uid));
  return snap.exists();
}

export function watchAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

async function deleteStorageFolder(folderRef: StorageReference) {
  const result = await listAll(folderRef);
  await Promise.all(result.items.map((item) => deleteObject(item)));
  await Promise.all(result.prefixes.map((prefix) => deleteStorageFolder(prefix)));
}

/**
 * Permanently deletes a project: every item document, every photo in
 * Storage under that project, and finally the project document itself.
 * There is no undo — the caller is responsible for confirming with the
 * contractor first.
 */
export async function deleteProjectCompletely(projectId: string) {
  const projectSnap = await getDoc(doc(db, "projects", projectId));
  const groupId = projectSnap.exists() ? projectSnap.data().groupId : null;

  const itemsSnap = await getDocs(collection(db, "projects", projectId, "items"));
  await Promise.all(itemsSnap.docs.map((itemDoc) => deleteDoc(itemDoc.ref)));

  await deleteStorageFolder(ref(storage, `projects/${projectId}`));

  await deleteDoc(doc(db, "projects", projectId));

  if (groupId) {
    await updateDoc(doc(db, "groups", groupId), {
      projectIds: arrayRemove(projectId)
    });
  }
}
