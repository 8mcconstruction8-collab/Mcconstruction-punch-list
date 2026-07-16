"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { MapPin } from "lucide-react";
import { db, ensureAnonymousAuth } from "@/lib/firebase";
import type { Group, Project } from "@/lib/types";
import BrandFooter from "@/components/BrandFooter";

type LocationName = {
  id: string;
  customerName: string;
};

export default function GroupSelectPage({
  params
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const [group, setGroup] = useState<Group | null>(null);
  const [locations, setLocations] = useState<LocationName[]>([]);
  const [loading, setLoading] = useState(true);

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
      const names = await Promise.all(
        projectIds.map(async (projectId) => {
          const projectSnap = await getDoc(doc(db, "projects", projectId));
          if (!projectSnap.exists()) return null;
          const data = projectSnap.data() as Project;
          return {
            id: projectSnap.id,
            customerName: data.customerName || "Untitled location"
          };
        })
      );

      setLocations(
        names
          .filter((n): n is LocationName => n !== null)
          .sort((a, b) => a.customerName.localeCompare(b.customerName))
      );
      setLoading(false);
    }

    load();
  }, [groupId]);

  if (loading) {
    return <main className="shell loading">Loading...</main>;
  }

  if (!group) {
    return <main className="shell loading">Group not found.</main>;
  }

  return (
    <main className="shell">
      <header className="brand">
        <img src="/brand/rounds-mark.png" alt="Rounds" className="logo" />
        <div>
          <h1>Rounds</h1>
          <p>{group.name}</p>
        </div>
      </header>

      <section className="card stack">
        <div>
          <h2 style={{ marginBottom: 4 }}>Select your location</h2>
          <p className="small">
            Choose the location you manage to open its punch list.
          </p>
        </div>

        {locations.length === 0 ? (
          <div className="empty">No locations available yet.</div>
        ) : (
          <div className="stack">
            {locations.map((loc) => (
              <Link
                key={loc.id}
                href={`/project/${loc.id}`}
                className="btn btn-secondary row"
                style={{ justifyContent: "flex-start" }}
              >
                <MapPin size={16} />
                {loc.customerName}
              </Link>
            ))}
          </div>
        )}
      </section>
      <BrandFooter />
    </main>
  );
}
