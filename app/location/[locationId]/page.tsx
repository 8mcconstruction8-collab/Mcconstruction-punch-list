"use client";

import { FormEvent, use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { Plus } from "lucide-react";
import {
  checkIsContractor,
  db,
  ensureAnonymousAuth,
  watchAuthState
} from "@/lib/firebase";
import type { Location, Project, ProjectStatus } from "@/lib/types";
import BrandFooter from "@/components/BrandFooter";

type RoundSummary = {
  id: string;
  roundLabel: string;
  status?: ProjectStatus;
  createdAt?: Project["createdAt"];
};

export default function LocationPage({
  params
}: {
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = use(params);
  const router = useRouter();
  const [location, setLocation] = useState<Location | null>(null);
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [isContractor, setIsContractor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewRoundForm, setShowNewRoundForm] = useState(false);
  const [newRoundLabel, setNewRoundLabel] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const unsubscribe = watchAuthState(async (user) => {
      const activeUser = user || (await ensureAnonymousAuth());
      const contractorAccount = activeUser
        ? await checkIsContractor(activeUser.uid)
        : false;
      setIsContractor(contractorAccount);

      const locationSnap = await getDoc(doc(db, "locations", locationId));
      if (!locationSnap.exists()) {
        setLoading(false);
        return;
      }
      const locationData = { id: locationSnap.id, ...locationSnap.data() } as Location;
      setLocation(locationData);

      const roundIds = locationData.roundIds || [];
      const roundDocs = await Promise.all(
        roundIds.map(async (roundId) => {
          const snap = await getDoc(doc(db, "projects", roundId));
          if (!snap.exists()) return null;
          const data = snap.data() as Project;
          return {
            id: snap.id,
            roundLabel: data.roundLabel || "Round",
            status: data.status,
            createdAt: data.createdAt
          } as RoundSummary;
        })
      );

      const validRounds = roundDocs
        .filter((r): r is RoundSummary => r !== null)
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

      setRounds(validRounds);
      setLoading(false);

      // Nothing to choose between — skip the tabs screen entirely.
      if (validRounds.length === 1) {
        router.replace(`/project/${validRounds[0].id}`);
      }
    });

    return unsubscribe;
  }, [locationId, router]);

  async function startNewRound(event: FormEvent) {
    event.preventDefault();
    if (!location) return;

    setStarting(true);
    try {
      const roundDoc = await addDoc(collection(db, "projects"), {
        customerName: location.name,
        address: location.address || "",
        contractorName: "MC Construction & Improvement",
        contractorUid: location.contractorUid,
        groupId: location.groupId || null,
        locationId: location.id,
        roundLabel: newRoundLabel.trim() || `Round ${rounds.length + 1}`,
        status: "open" as ProjectStatus,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, "locations", location.id), {
        roundIds: arrayUnion(roundDoc.id)
      });

      router.push(`/project/${roundDoc.id}`);
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return <main className="shell loading">Loading...</main>;
  }

  if (!location) {
    return <main className="shell loading">Location not found.</main>;
  }

  return (
    <main className="shell">
      <header className="brand">
        <img src="/brand/rounds-mark.png" alt="Rounds" className="logo" />
        <div>
          <h1>Rounds</h1>
          <p>{location.name}</p>
        </div>
      </header>

      <section className="card stack">
        <div>
          <h2 style={{ marginBottom: 4 }}>{location.name}</h2>
          {location.address && <p className="small">{location.address}</p>}
        </div>

        {rounds.length === 0 ? (
          <div className="empty">No work started at this location yet.</div>
        ) : (
          <div className="stack">
            {rounds.map((round) => (
              <Link
                key={round.id}
                href={`/project/${round.id}`}
                className="btn btn-secondary row between"
              >
                <span>{round.roundLabel}</span>
                <span
                  className={
                    round.status === "closed" ? "badge badge-neutral" : "badge badge-open"
                  }
                >
                  {round.status === "closed" ? "Closed" : "Open"}
                </span>
              </Link>
            ))}
          </div>
        )}

        {isContractor && (
          <>
            <button
              className="btn btn-secondary row"
              onClick={() => setShowNewRoundForm((value) => !value)}
            >
              <Plus size={16} />
              {showNewRoundForm ? "Cancel" : "Start new round"}
            </button>

            {showNewRoundForm && (
              <form className="stack" onSubmit={startNewRound}>
                <label>
                  What&apos;s this round for?
                  <input
                    value={newRoundLabel}
                    onChange={(e) => setNewRoundLabel(e.target.value)}
                    placeholder="e.g. Electrical, Plumbing, Painting"
                  />
                </label>
                <button className="btn btn-primary" disabled={starting}>
                  {starting ? "Starting..." : "Start round"}
                </button>
              </form>
            )}
          </>
        )}
      </section>
      <BrandFooter />
    </main>
  );
}
