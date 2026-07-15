"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { collection, doc, getCountFromServer, getDoc, where, query } from "firebase/firestore";
import { Search } from "lucide-react";
import { db, ensureAnonymousAuth, watchAuthState } from "@/lib/firebase";
import type { Group, Project } from "@/lib/types";

type LocationSummary = Project & {
  itemCount: number;
  completedCount: number;
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

      const projectIds = groupData.projectIds || [];
      const withCounts = await Promise.all(
        projectIds.map(async (projectId) => {
          const projectSnap = await getDoc(doc(db, "projects", projectId));
          if (!projectSnap.exists()) return null;

          const itemsRef = collection(db, "projects", projectId, "items");
          const [totalSnap, completedSnap] = await Promise.all([
            getCountFromServer(itemsRef),
            getCountFromServer(query(itemsRef, where("status", "==", "completed")))
          ]);

          return {
            id: projectSnap.id,
            ...projectSnap.data(),
            itemCount: totalSnap.data().count,
            completedCount: completedSnap.data().count
          } as LocationSummary;
        })
      );

      setLocations(withCounts.filter((p): p is LocationSummary => p !== null));
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
      (loc.customerName || "").toLowerCase().includes(term) ||
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
        <img src="/brand/logo-mark.png" alt="MC Construction" className="logo" />
        <div>
          <h1>MC Punch List</h1>
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
                href={`/project/${loc.id}`}
                className="card project-row"
                style={{ display: "block", marginTop: 12 }}
              >
                <div className="row between">
                  <div>
                    <strong>{loc.customerName || "Waiting for info"}</strong>
                    <div className="small">{loc.address || "Address pending"}</div>
                  </div>
                  {loc.status === "closed" ? (
                    <span className="badge badge-neutral">Closed</span>
                  ) : openCount > 0 ? (
                    <span className="badge badge-open">{openCount} open</span>
                  ) : (
                    <span className="badge badge-done">Complete</span>
                  )}
                </div>
                <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
                  {loc.completedCount} of {loc.itemCount} items completed ({percent}%)
                </p>
              </Link>
            );
          })
        )}
      </section>
    </main>
  );
}
