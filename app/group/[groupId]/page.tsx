"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { collection, doc, getCountFromServer, getDoc, where, query } from "firebase/firestore";
import { Search } from "lucide-react";
import { db, ensureAnonymousAuth, watchAuthState } from "@/lib/firebase";
import type { Group, Location, Project } from "@/lib/types";
import BrandFooter from "@/components/BrandFooter";

type LocationSummary = Location & {
  itemCount: number;
  completedCount: number;
  hasOpenRound: boolean;
  roundCount: number;
};

export default function GroupPage({
  params
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const [group, setGroup] = useState<Group | null>(null);
  const [locations, setLocations] = useState<LocationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      await ensureAnonymousAuth();

      const groupSnap = await getDoc(doc(db, "groups", groupId));
      if (!groupSnap.exists()) {
        setLoading(false);
        return;
      }
      const groupData = { id: groupSnap.id, ...groupSnap.data() } as Group;
      setGroup(groupData);

      const locationIds = groupData.locationIds || [];
      const withCounts = await Promise.all(
        locationIds.map(async (locationId) => {
          const locationSnap = await getDoc(doc(db, "locations", locationId));
          if (!locationSnap.exists()) return null;
          const locationData = { id: locationSnap.id, ...locationSnap.data() } as Location;

          const roundIds = locationData.roundIds || [];
          let itemCount = 0;
          let completedCount = 0;
          let hasOpenRound = false;

          await Promise.all(
            roundIds.map(async (roundId) => {
              const roundSnap = await getDoc(doc(db, "projects", roundId));
              if (!roundSnap.exists()) return;
              const round = roundSnap.data() as Project;
              if (round.status !== "closed") hasOpenRound = true;

              const itemsRef = collection(db, "projects", roundId, "items");
              const [totalSnap, completedSnap] = await Promise.all([
                getCountFromServer(itemsRef),
                getCountFromServer(query(itemsRef, where("status", "==", "completed")))
              ]);
              itemCount += totalSnap.data().count;
              completedCount += completedSnap.data().count;
            })
          );

          return {
            ...locationData,
            itemCount,
            completedCount,
            hasOpenRound,
            roundCount: roundIds.length
          } as LocationSummary;
        })
      );

      setLocations(withCounts.filter((l): l is LocationSummary => l !== null));
      setLoading(false);
    }

    const unsubscribe = watchAuthState(() => {});
    load();
    return unsubscribe;
  }, [groupId]);

  if (loading) {
    return <main className="shell loading">Loading...</main>;
  }

  if (!group) {
    return <main className="shell loading">Group not found.</main>;
  }

  const filtered = locations.filter((loc) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      (loc.name || "").toLowerCase().includes(term) ||
      (loc.address || "").toLowerCase().includes(term)
    );
  });

  const totalOpen = locations.reduce(
    (sum, loc) => sum + (loc.itemCount - loc.completedCount),
    0
  );
  const avgCompletion =
    locations.length === 0
      ? 0
      : Math.round(
          (locations.reduce(
            (sum, loc) => sum + (loc.itemCount === 0 ? 0 : loc.completedCount / loc.itemCount),
            0
          ) /
            locations.length) *
            100
        );

  return (
    <main className="shell">
      <header className="brand">
        <img src="/brand/rounds-mark.png" alt="Rounds" className="logo" />
        <div>
          <h1>Rounds</h1>
          <p>{group.name}</p>
        </div>
      </header>

      <section className="summary-strip">
        <div className="summary-card">
          <div className="num">{locations.length}</div>
          <div className="label">Locations</div>
        </div>
        <div className="summary-card">
          <div className="num">{totalOpen}</div>
          <div className="label">Open items</div>
        </div>
        <div className="summary-card">
          <div className="num">{avgCompletion}%</div>
          <div className="label">Avg. completion</div>
        </div>
      </section>

      <section className="card stack">
        <label style={{ margin: 0 }}>
          <span className="row">
            <Search size={15} />
            Search locations
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Location name or address"
          />
        </label>
      </section>

      <section style={{ marginTop: 16 }}>
        {filtered.length === 0 ? (
          <div className="card empty">
            {locations.length === 0
              ? "No locations added to this group yet."
              : "No locations match your search."}
          </div>
        ) : (
          filtered.map((loc) => {
            const percent =
              loc.itemCount === 0 ? 0 : Math.round((loc.completedCount / loc.itemCount) * 100);
            const openCount = loc.itemCount - loc.completedCount;

            return (
              <Link
                key={loc.id}
                href={`/location/${loc.id}`}
                className="card project-row"
                style={{ display: "block", marginTop: 12 }}
              >
                <div className="row between">
                  <div>
                    <strong>{loc.name}</strong>
                    <div className="small">{loc.address || "No address on file"}</div>
                  </div>
                  {!loc.hasOpenRound ? (
                    <span className="badge badge-neutral">No open round</span>
                  ) : openCount > 0 ? (
                    <span className="badge badge-open">{openCount} open</span>
                  ) : (
                    <span className="badge badge-done">Complete</span>
                  )}
                </div>
                <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
                  {loc.completedCount} of {loc.itemCount} items completed ({percent}%) ·{" "}
                  {loc.roundCount} round{loc.roundCount === 1 ? "" : "s"}
                </p>
              </Link>
            );
          })
        )}
      </section>
      <BrandFooter />
    </main>
  );
}
