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
  addDoc,
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
  serverTimestamp,
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

/**
 * The single contractor account's notification email, stamped onto every
 * project at creation time (as contractorNotifyEmail). Denormalized onto
 * the project itself — rather than read from the contractors collection,
 * which customers can't read — so both the client and the Firestore
 * rules for the `mail` collection have something they can check without
 * needing extra permissions.
 */
export const DEFAULT_CONTRACTOR_NOTIFY_EMAIL =
  process.env.NEXT_PUBLIC_DEFAULT_CONTRACTOR_EMAIL || "";

/**
 * Queues a notification email to the contractor who owns this project,
 * via the Firebase "Trigger Email" extension (watches the `mail`
 * collection). Silently does nothing if the project has no
 * contractorNotifyEmail on file (e.g. projects created before this
 * feature existed) — a missing notification is better than a crash.
 */
/**
 * Builds a simple branded HTML email: dark header with the Rounds
 * wordmark, the subject as a heading, each body line as its own
 * paragraph, and — if a line is a raw "Open the punch list"-style link
 * — turns it into a proper button instead of leaving it as bare text.
 */
function buildNotificationEmailHtml(subject: string, bodyLines: string[]): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const logoUrl = `${origin}/brand/rounds-mark.png`;

  // If the caller built the subject as "Task — Location — Description",
  // use just the first segment as the in-body heading — repeating the
  // whole subject line inside the email too is redundant once it's
  // already longer and descriptive in the inbox.
  const heading = subject.includes(" — ") ? subject.split(" — ")[0] : subject;

  const parts = bodyLines
    .filter((line) => line && line.trim().length > 0)
    .map((line) => {
      // A caller-prebuilt block of raw HTML (e.g. a side-by-side photo
      // row) — pass it straight through, no wrapping or reformatting.
      if (line.startsWith("__RAW__")) {
        return line.slice(7);
      }

      const linkMatch = line.match(/<a href="([^"]+)">([^<]+)<\/a>/);
      if (linkMatch) {
        const [, url, label] = linkMatch;
        return `
          <div style="margin:22px 0 4px;">
            <a href="${url}"
               style="background:#111111;color:#ffffff;text-decoration:none;
                      padding:12px 22px;border-radius:10px;font-weight:700;
                      font-size:14px;display:inline-block;">
              ${label} →
            </a>
          </div>`;
      }

      const imgMatch = line.match(/<img src="([^"]+)" alt="([^"]*)"\s*\/?>/);
      if (imgMatch) {
        const [, src, alt] = imgMatch;
        return `
          <div style="margin:0 0 14px;">
            <div style="font-size:12px;color:#888888;margin-bottom:6px;">${alt}</div>
            <img src="${src}" alt="${alt}"
                 style="max-width:220px;max-height:220px;border-radius:10px;
                        border:1px solid #eee;display:block;" />
          </div>`;
      }

      // "Label: value" lines get their own small-caps label above the
      // value, instead of a single run-on line of bold-then-plain text.
      const fieldMatch = line.match(/^<strong>([^<]+):<\/strong>\s*(.*)$/);
      if (fieldMatch) {
        const [, label, value] = fieldMatch;
        return `
          <div style="margin:0 0 13px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;
                        color:#999999;margin-bottom:2px;">${label}</div>
            <div style="font-size:15px;color:#111111;line-height:1.45;">${value}</div>
          </div>`;
      }

      return `<p style="margin:0 0 10px;color:#333333;font-size:15px;line-height:1.5;">${line}</p>`;
    });

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;padding:24px;">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;
                  overflow:hidden;border:1px solid #eaeaea;">
        <div style="background:#111111;padding:16px 24px;display:flex;align-items:center;">
          <img src="${logoUrl}" alt="Rounds" width="32" height="32"
               style="width:32px;height:32px;display:block;margin-right:10px;" />
          <div>
            <div style="color:#ffffff;font-weight:900;font-size:16px;letter-spacing:-0.3px;">
              Rounds
            </div>
            <div style="color:#999999;font-size:10px;margin-top:1px;">
              by MC Construction &amp; Improvement
            </div>
          </div>
        </div>
        <div style="padding:24px;">
          <h2 style="margin:0 0 4px;font-size:17px;color:#111111;">${heading}</h2>
          <div style="height:1px;background:#eeeeee;margin:0 0 18px;"></div>
          ${parts.join("")}
        </div>
        <div style="padding:14px 24px;background:#fafafa;border-top:1px solid #eeeeee;">
          <p style="margin:0;font-size:11px;color:#aaaaaa;">
            Automated update from Rounds, your MC Construction &amp; Improvement punch list.
          </p>
        </div>
      </div>
    </div>`;
}

export async function notifyContractor(
  projectId: string,
  contractorNotifyEmail: string | undefined | null,
  subject: string,
  bodyLines: string[]
) {
  if (!contractorNotifyEmail) return;
  try {
    await addDoc(collection(db, "mail"), {
      to: [contractorNotifyEmail],
      projectId,
      message: {
        subject,
        html: buildNotificationEmailHtml(subject, bodyLines)
      }
    });
  } catch (err) {
    console.error("Failed to queue notification email", err);
  }
}

/**
 * Queues a notification email to the customer, only ever called from
 * contractor-triggered actions (the Firestore rule for the mail
 * collection only allows this write when the caller is a contractor).
 */
export async function notifyCustomer(
  projectId: string,
  customerEmail: string | undefined | null,
  subject: string,
  bodyLines: string[]
) {
  if (!customerEmail) return;
  try {
    await addDoc(collection(db, "mail"), {
      to: [customerEmail],
      projectId,
      message: {
        subject,
        html: buildNotificationEmailHtml(subject, bodyLines)
      }
    });
  } catch (err) {
    console.error("Failed to queue customer notification email", err);
  }
}

/**
 * Queues a notification email to the owner of the group a location
 * belongs to, if one is on file. Only fired for headline events (a new
 * round starting, a new manager coming online) — not every item, photo
 * or comment, so owners don't get flooded.
 */
export async function notifyOwner(
  projectId: string,
  ownerNotifyEmail: string | undefined | null,
  subject: string,
  bodyLines: string[]
) {
  if (!ownerNotifyEmail) return;
  try {
    await addDoc(collection(db, "mail"), {
      to: [ownerNotifyEmail],
      projectId,
      message: {
        subject,
        html: buildNotificationEmailHtml(subject, bodyLines)
      }
    });
  } catch (err) {
    console.error("Failed to queue owner notification email", err);
  }
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
  const locationId = projectSnap.exists() ? projectSnap.data().locationId : null;

  const itemsSnap = await getDocs(collection(db, "projects", projectId, "items"));
  await Promise.all(itemsSnap.docs.map((itemDoc) => deleteDoc(itemDoc.ref)));

  await deleteStorageFolder(ref(storage, `projects/${projectId}`));

  await deleteDoc(doc(db, "projects", projectId));

  if (groupId) {
    await updateDoc(doc(db, "groups", groupId), {
      projectIds: arrayRemove(projectId)
    });
  }

  if (locationId) {
    await updateDoc(doc(db, "locations", locationId), {
      roundIds: arrayRemove(projectId)
    });
  }
}

/**
 * One-time migration: turns a group's directly-attached projects into
 * proper Locations, each starting with its existing project as "Round 1".
 * Safe to run more than once — any project that already has a
 * locationId is skipped, so nothing gets duplicated.
 */
export async function migrateGroupToLocations(groupId: string) {
  const groupSnap = await getDoc(doc(db, "groups", groupId));
  if (!groupSnap.exists()) throw new Error("Group not found");
  const group = groupSnap.data();
  const projectIds: string[] = group.projectIds || [];
  const newLocationIds: string[] = [...(group.locationIds || [])];

  for (const projectId of projectIds) {
    const projectSnap = await getDoc(doc(db, "projects", projectId));
    if (!projectSnap.exists()) continue;
    const project = projectSnap.data();
    if (project.locationId) continue;

    const locationDoc = await addDoc(collection(db, "locations"), {
      name: project.customerName || "Untitled location",
      address: project.address || "",
      groupId,
      contractorUid: project.contractorUid,
      contractorNotifyEmail: project.contractorNotifyEmail || DEFAULT_CONTRACTOR_NOTIFY_EMAIL,
      ownerNotifyEmail: group.ownerEmail || null,
      roundIds: [projectId],
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "projects", projectId), {
      locationId: locationDoc.id,
      roundLabel: "Round 1",
      ownerNotifyEmail: group.ownerEmail || null
    });

    newLocationIds.push(locationDoc.id);
  }

  await updateDoc(doc(db, "groups", groupId), {
    locationIds: newLocationIds,
    projectIds: []
  });
}
