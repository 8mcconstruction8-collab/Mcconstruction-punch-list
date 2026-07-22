"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { MapPin } from "lucide-react";
import { db, ensureAnonymousAuth } from "@/lib/firebase";
import type { Group, Location } from "@/lib/types";
import BrandFooter from "@/components/BrandFooter";
import InstallAppButton from "@/components/InstallAppButton";

type LocationName = {
  id: string;
  name: string;
  address?: string;
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

      const locationIds = groupData.locationIds || [];
      const names = await Promise.all(
        locationIds.map(async (locationId) => {
          const locationSnap = await getDoc(doc(db, "locations", locationId));
          if (!locationSnap.exists()) return null;
          const data = locationSnap.data() as Location;
          return {
            id: locationSnap.id,
            name: data.name || "Untitled location",
            address: data.address || ""
          } as LocationName;
        })
      );

      setLocations(
        names
          .filter((n): n is LocationName => n !== null)
          .sort((a, b) => a.name.localeCompare(b.name))
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

        <InstallAppButton />

        {locations.length === 0 ? (
          <div className="empty">No locations available yet.</div>
        ) : (
          <div className="stack">
            {locations.map((loc) => (
              <Link
                key={loc.id}
                href={`/location/${loc.id}`}
                className="btn btn-secondary row"
                style={{ justifyContent: "flex-start", alignItems: "flex-start" }}
              >
                <MapPin size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>
                  <span style={{ display: "block" }}>{loc.name}</span>
                  {loc.address && (
                    <span className="small" style={{ display: "block", fontWeight: 400 }}>
                      {loc.address}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
      <BrandFooter />
    </main>
  );
}
