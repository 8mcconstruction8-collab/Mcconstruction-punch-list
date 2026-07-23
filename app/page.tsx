"use client";

import { FormEvent, MouseEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import {
  Bell,
  Building2,
  ChevronDown,
  ClipboardCheck,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2
} from "lucide-react";
import {
  checkIsContractor,
  db,
  DEFAULT_CONTRACTOR_NOTIFY_EMAIL,
  deleteProjectCompletely,
  migrateGroupToLocations,
  signOutContractor,
  watchAuthState
} from "@/lib/firebase";
import type { Group, Location, Project, ProjectStatus } from "@/lib/types";
import type { User } from "firebase/auth";
import BrandFooter from "@/components/BrandFooter";

type ProjectSummary = Project & {
  itemCount: number;
  completedCount: number;
};

export default function HomePage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [contractor, setContractor] = useState<User | null>(null);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastProjectUrl, setLastProjectUrl] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showGroupsPanel, setShowGroupsPanel] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [lastGroupUrl, setLastGroupUrl] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");

  const [locations, setLocations] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [showLocationsPanel, setShowLocationsPanel] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationGroupId, setLocationGroupId] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [lastLocationUrl, setLastLocationUrl] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [migratingGroupId, setMigratingGroupId] = useState<string | null>(null);
  const [startingRoundId, setStartingRoundId] = useState<string | null>(null);

  const [seenRoundCounts, setSeenRoundCounts] = useState<Record<string, number>>({});
  const [seenStandaloneCount, setSeenStandaloneCount] = useState(0);
  const [activitySeenLoaded, setActivitySeenLoaded] = useState(false);
  const [hasStoredBaseline, setHasStoredBaseline] = useState(true);

  useEffect(() => {
    const unsubscribe = watchAuthState(async (user) => {
      if (!user || user.isAnonymous) {
        router.replace("/login");
        return;
      }

      const isContractor = await checkIsContractor(user.uid);
      if (!isContractor) {
        router.replace("/login");
        return;
      }

      setContractor(user);
      setCheckingAuth(false);
    });

    return unsubscribe;
  }, [router]);

  useEffect(() => {
    if (!contractor) return;
    loadProjects(contractor.uid);
    loadGroups(contractor.uid);
    loadLocations(contractor.uid);
  }, [contractor]);

  useEffect(() => {
    try {
      const storedCounts = localStorage.getItem("rounds_seen_round_counts");
      if (storedCounts) {
        setSeenRoundCounts(JSON.parse(storedCounts));
      } else {
        setHasStoredBaseline(false);
      }
      const storedStandalone = localStorage.getItem("rounds_seen_standalone_count");
      if (storedStandalone) setSeenStandaloneCount(Number(storedStandalone));
    } catch (err) {
      console.error(err);
    } finally {
      setActivitySeenLoaded(true);
    }
  }, []);

  // First time this feature runs, there's nothing to compare against yet —
  // silently treat whatever already exists as the starting point instead
  // of flashing a misleading "everything is new" badge.
  useEffect(() => {
    if (hasStoredBaseline) return;
    if (loadingLocations || loadingProjects) return;
    if (locations.length === 0 && projects.length === 0) return;

    const counts: Record<string, number> = {};
    locations.forEach((loc) => {
      counts[loc.id] = loc.roundIds?.length || 0;
    });
    setSeenRoundCounts(counts);
    localStorage.setItem("rounds_seen_round_counts", JSON.stringify(counts));

    const standaloneCount = projects.filter(
      (p) => !p.locationId && !p.groupId
    ).length;
    setSeenStandaloneCount(standaloneCount);
    localStorage.setItem("rounds_seen_standalone_count", String(standaloneCount));

    setHasStoredBaseline(true);
  }, [hasStoredBaseline, loadingLocations, loadingProjects, locations, projects]);

  function markActivitySeen() {
    const counts: Record<string, number> = {};
    locations.forEach((loc) => {
      counts[loc.id] = loc.roundIds?.length || 0;
    });
    setSeenRoundCounts(counts);
    localStorage.setItem("rounds_seen_round_counts", JSON.stringify(counts));

    const standaloneCount = projects.filter(
      (p) => !p.locationId && !p.groupId
    ).length;
    setSeenStandaloneCount(standaloneCount);
    localStorage.setItem("rounds_seen_standalone_count", String(standaloneCount));

    setShowLocationsPanel(true);
  }

  async function loadLocations(uid: string) {
    setLoadingLocations(true);
    try {
      const locationsQuery = query(
        collection(db, "locations"),
        where("contractorUid", "==", uid),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(locationsQuery);
      const fetched = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Location
      );
      setLocations(fetched);

      // Self-heal: locations created before contractorNotifyEmail existed
      // are missing that field, which silently blocks "Start new round"
      // for anyone but the contractor. Backfill it quietly in the
      // background — no need to bother the user with this.
      const needsRepair = fetched.filter((loc) => !loc.contractorNotifyEmail);
      if (needsRepair.length > 0 && DEFAULT_CONTRACTOR_NOTIFY_EMAIL) {
        await Promise.all(
          needsRepair.map((loc) =>
            updateDoc(doc(db, "locations", loc.id), {
              contractorNotifyEmail: DEFAULT_CONTRACTOR_NOTIFY_EMAIL
            }).catch((err) => console.error("Location repair failed", loc.id, err))
          )
        );
        setLocations((current) =>
          current.map((loc) =>
            needsRepair.some((r) => r.id === loc.id)
              ? { ...loc, contractorNotifyEmail: DEFAULT_CONTRACTOR_NOTIFY_EMAIL }
              : loc
          )
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLocations(false);
    }
  }

  async function createLocation(event: FormEvent) {
    event.preventDefault();
    setLocationError("");
    setLastLocationUrl("");

    if (!contractor) return;
    if (!locationName.trim()) {
      setLocationError("Give the location a name (e.g. the site or store name).");
      return;
    }

    try {
      setLocationBusy(true);
      const location = await addDoc(collection(db, "locations"), {
        name: locationName.trim(),
        address: locationAddress.trim() || null,
        groupId: locationGroupId || null,
        contractorUid: contractor.uid,
        contractorNotifyEmail: DEFAULT_CONTRACTOR_NOTIFY_EMAIL,
        roundIds: [],
        createdAt: serverTimestamp()
      });

      if (locationGroupId) {
        await updateDoc(doc(db, "groups", locationGroupId), {
          locationIds: arrayUnion(location.id)
        });
      }

      setLocationName("");
      setLocationAddress("");
      setLocationGroupId("");
      setLastLocationUrl(`${window.location.origin}/location/${location.id}`);
      loadLocations(contractor.uid);
      if (locationGroupId) loadGroups(contractor.uid);
    } catch (err) {
      console.error(err);
      setLocationError("Couldn't create the location. Please try again.");
    } finally {
      setLocationBusy(false);
    }
  }

  async function handleMigrateGroup(groupId: string) {
    const confirmed = confirm(
      "Convert this group's existing punch lists into Locations, each becoming \"Round 1\"? Safe to run, and safe to run twice."
    );
    if (!confirmed) return;

    setMigratingGroupId(groupId);
    try {
      await migrateGroupToLocations(groupId);
      if (contractor) {
        await loadGroups(contractor.uid);
        await loadLocations(contractor.uid);
        await loadProjects(contractor.uid);
      }
    } catch (err) {
      console.error(err);
      alert("Migration failed. Please try again.");
    } finally {
      setMigratingGroupId(null);
    }
  }

  async function handleStartRound(location: Location) {
    const label = prompt(
      "What's this round for? (e.g. Electrical, Plumbing, Painting)",
      `Round ${(location.roundIds?.length || 0) + 1}`
    );
    if (label === null) return; // cancelled

    setStartingRoundId(location.id);
    try {
      const roundDoc = await addDoc(collection(db, "projects"), {
        customerName: location.name,
        address: location.address || "",
        contractorName: "MC Construction & Improvement",
        contractorUid: location.contractorUid,
        contractorNotifyEmail: DEFAULT_CONTRACTOR_NOTIFY_EMAIL,
        groupId: location.groupId || null,
        locationId: location.id,
        roundLabel: label.trim() || `Round ${(location.roundIds?.length || 0) + 1}`,
        status: "open" as ProjectStatus,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, "locations", location.id), {
        roundIds: arrayUnion(roundDoc.id)
      });

      const roundUrl = `${window.location.origin}/project/${roundDoc.id}`;
      await navigator.clipboard.writeText(roundUrl);
      alert(`Round started. Link copied:\n${roundUrl}`);

      if (contractor) loadLocations(contractor.uid);
    } catch (err) {
      console.error(err);
      alert("Couldn't start the round. Please try again.");
    } finally {
      setStartingRoundId(null);
    }
  }

  async function loadGroups(uid: string) {
    setLoadingGroups(true);
    try {
      const groupsQuery = query(
        collection(db, "groups"),
        where("contractorUid", "==", uid),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(groupsQuery);
      setGroups(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Group)
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingGroups(false);
    }
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    setGroupError("");
    setLastGroupUrl("");

    if (!contractor) return;
    if (!groupName.trim()) {
      setGroupError("Give the group a name (e.g. the company or owner's name).");
      return;
    }

    try {
      setGroupBusy(true);
      const group = await addDoc(collection(db, "groups"), {
        name: groupName.trim(),
        ownerName: ownerName.trim() || null,
        ownerEmail: ownerEmail.trim() || null,
        contractorUid: contractor.uid,
        projectIds: [],
        createdAt: serverTimestamp()
      });

      setGroupName("");
      setOwnerName("");
      setOwnerEmail("");
      setLastGroupUrl(`${window.location.origin}/group/${group.id}`);
      loadGroups(contractor.uid);
    } catch (err) {
      console.error(err);
      setGroupError("Couldn't create the group. Please try again.");
    } finally {
      setGroupBusy(false);
    }
  }

  async function loadProjects(uid: string) {
    setLoadingProjects(true);
    try {
      const projectsQuery = query(
        collection(db, "projects"),
        where("contractorUid", "==", uid),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(projectsQuery);

      const withCounts = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const projectData = { id: docSnap.id, ...docSnap.data() } as Project;
          const itemsRef = collection(db, "projects", docSnap.id, "items");

          const [totalSnap, completedSnap] = await Promise.all([
            getCountFromServer(itemsRef),
            getCountFromServer(
              query(itemsRef, where("status", "==", "completed"))
            )
          ]);

          return {
            ...projectData,
            itemCount: totalSnap.data().count,
            completedCount: completedSnap.data().count
          } as ProjectSummary;
        })
      );

      setProjects(withCounts);

      // Self-heal: projects created before contractorNotifyEmail existed
      // are missing that field, which silently blocks notification
      // emails for that project (no error — the code just has nowhere
      // to send it). Backfill it quietly in the background.
      const needsRepair = withCounts.filter((p) => !p.contractorNotifyEmail);
      if (needsRepair.length > 0 && DEFAULT_CONTRACTOR_NOTIFY_EMAIL) {
        await Promise.all(
          needsRepair.map((p) =>
            updateDoc(doc(db, "projects", p.id), {
              contractorNotifyEmail: DEFAULT_CONTRACTOR_NOTIFY_EMAIL
            }).catch((err) => console.error("Project repair failed", p.id, err))
          )
        );
        setProjects((current) =>
          current.map((p) =>
            needsRepair.some((r) => r.id === p.id)
              ? { ...p, contractorNotifyEmail: DEFAULT_CONTRACTOR_NOTIFY_EMAIL }
              : p
          )
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProjects(false);
    }
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLastProjectUrl("");

    if (!contractor) return;

    try {
      setBusy(true);
      const selectedLocation = selectedLocationId
        ? locations.find((loc) => loc.id === selectedLocationId)
        : null;

      const project = await addDoc(collection(db, "projects"), {
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || null,
        address: address.trim(),
        contractorName: "MC Construction & Improvement",
        contractorUid: contractor.uid,
        contractorNotifyEmail: DEFAULT_CONTRACTOR_NOTIFY_EMAIL,
        groupId: selectedLocationId
          ? selectedLocation?.groupId || null
          : selectedGroupId || null,
        locationId: selectedLocationId || null,
        roundLabel: selectedLocationId ? "Round 1" : null,
        status: "open" as ProjectStatus,
        createdAt: serverTimestamp()
      });

      if (selectedLocationId) {
        await updateDoc(doc(db, "locations", selectedLocationId), {
          roundIds: arrayUnion(project.id)
        });
      } else if (selectedGroupId) {
        await updateDoc(doc(db, "groups", selectedGroupId), {
          projectIds: arrayUnion(project.id)
        });
      }

      setCustomerName("");
      setCustomerEmail("");
      setAddress("");
      setLastProjectUrl(`${window.location.origin}/project/${project.id}`);
      loadProjects(contractor.uid);
      if (selectedLocationId) loadLocations(contractor.uid);
    } catch (err) {
      console.error(err);
      setError("Couldn't create the punch list. Check your Firebase configuration.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(
    event: MouseEvent,
    project: ProjectSummary
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!contractor) return;

    const label = project.customerName || "this unnamed project";
    const confirmed = confirm(
      `Delete "${label}" forever? This removes every item and photo. This can't be undone.`
    );
    if (!confirmed) return;

    setDeletingId(project.id);
    try {
      await deleteProjectCompletely(project.id);
      setProjects((current) => current.filter((p) => p.id !== project.id));
    } catch (err) {
      console.error(err);
      alert("Couldn't delete. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAssignGroup(
    projectId: string,
    newGroupId: string,
    previousGroupId?: string
  ) {
    try {
      await updateDoc(doc(db, "projects", projectId), {
        groupId: newGroupId || null
      });

      if (previousGroupId && previousGroupId !== newGroupId) {
        await updateDoc(doc(db, "groups", previousGroupId), {
          projectIds: arrayRemove(projectId)
        });
      }

      if (newGroupId) {
        await updateDoc(doc(db, "groups", newGroupId), {
          projectIds: arrayUnion(projectId)
        });
      }

      setProjects((current) =>
        current.map((p) =>
          p.id === projectId ? { ...p, groupId: newGroupId || undefined } : p
        )
      );
    } catch (err) {
      console.error(err);
      alert("Couldn't update the group for this project.");
    }
  }

  if (checkingAuth) {
    return <main className="shell loading">Loading...</main>;
  }

  const filteredProjects = projects
    .filter((project) => !project.locationId && !project.groupId)
    .filter((project) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return (
        project.customerName.toLowerCase().includes(term) ||
        project.address.toLowerCase().includes(term)
      );
    });

  const roundStatsByLocation: Record<string, { open: number; total: number }> = {};
  projects.forEach((p) => {
    if (!p.locationId) return;
    if (!roundStatsByLocation[p.locationId]) {
      roundStatsByLocation[p.locationId] = { open: 0, total: 0 };
    }
    roundStatsByLocation[p.locationId].total += 1;
    if (p.status !== "closed") roundStatsByLocation[p.locationId].open += 1;
  });

  const newRoundsByLocation: Record<string, number> = {};
  let totalNewRounds = 0;
  locations.forEach((loc) => {
    const seen = seenRoundCounts[loc.id] || 0;
    const current = loc.roundIds?.length || 0;
    const diff = Math.max(0, current - seen);
    newRoundsByLocation[loc.id] = diff;
    totalNewRounds += diff;
  });
  const standaloneCount = projects.filter(
    (p) => !p.locationId && !p.groupId
  ).length;
  const newStandaloneCount = Math.max(0, standaloneCount - seenStandaloneCount);
  const totalNewActivity = activitySeenLoaded
    ? totalNewRounds + newStandaloneCount
    : 0;

  return (
    <main className="shell">
      <header className="brand">
        <img src="/brand/rounds-mark.png" alt="Rounds" className="logo" />
        <div>
          <h1>Rounds</h1>
          
        </div>
        <button
          className="btn btn-secondary row"
          style={{ marginLeft: "auto", position: "relative" }}
          onClick={markActivitySeen}
          title={
            totalNewActivity > 0
              ? `${totalNewActivity} new since last visit`
              : "No new activity"
          }
        >
          <Bell size={16} />
          {totalNewActivity > 0 && (
            <span
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                background: "#b42318",
                color: "white",
                borderRadius: "999px",
                fontSize: 11,
                fontWeight: 800,
                minWidth: 18,
                height: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 4px"
              }}
            >
              {totalNewActivity}
            </span>
          )}
        </button>
        <button
          className="btn btn-secondary row"
          onClick={async () => {
            await signOutContractor();
            router.replace("/login");
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </header>

      <section className="card stack">
        <div>
          <strong>Fixed link for new customers</strong>
          <p className="small" style={{ marginTop: 4 }}>
            Always the same link — send it to any new customer. Whoever
            opens it gets their own punch list created automatically and
            fills in their own details.
          </p>
        </div>
        <code style={{ wordBreak: "break-all" }}>
          {typeof window !== "undefined" ? `${window.location.origin}/start` : "/start"}
        </code>
        <button
          className="btn btn-secondary"
          onClick={() =>
            navigator.clipboard.writeText(`${window.location.origin}/start`)
          }
        >
          Copy fixed link
        </button>
      </section>

      <section className="card stack">
        <button
          className="row between"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            width: "100%",
            textAlign: "left",
            cursor: "pointer"
          }}
          onClick={() => setShowGroupsPanel((value) => !value)}
        >
          <div className="row">
            <Building2 size={20} />
            <div>
              <strong>Groups (owners with multiple locations)</strong>
              <p className="small" style={{ marginTop: 4, marginBottom: 0 }}>
                {groups.length} group{groups.length === 1 ? "" : "s"} — tap to{" "}
                {showGroupsPanel ? "collapse" : "expand"}
              </p>
            </div>
          </div>
          <ChevronDown
            size={18}
            style={{
              transform: showGroupsPanel ? "rotate(180deg)" : "none",
              transition: "transform .15s ease"
            }}
          />
        </button>

        {showGroupsPanel && (
          <>
            <p className="small" style={{ marginTop: 0 }}>
              For customers with more than one job site. Two links per group:
              one for the owner, showing every location together — and one
              shared link for all managers, where each picks their own
              location before starting its punch list.
            </p>

            {!loadingGroups && groups.length > 0 && (
          <div className="stack">
            {groups.map((group) => (
              <div key={group.id} className="row between">
                <div>
                  <strong style={{ fontSize: 14 }}>{group.name}</strong>
                  <div className="small">
                    {group.locationIds?.length || 0} location
                    {group.locationIds?.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="row">
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 12 }}
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `${window.location.origin}/group/${group.id}`
                      )
                    }
                  >
                    Copy owner link
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 12 }}
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `${window.location.origin}/group/${group.id}/select`
                      )
                    }
                  >
                    Copy manager link
                  </button>
                  {(group.projectIds?.length || 0) > 0 && (
                    <button
                      className="btn btn-secondary row"
                      style={{ fontSize: 12 }}
                      disabled={migratingGroupId === group.id}
                      onClick={() => handleMigrateGroup(group.id)}
                      title="Convert this group's direct punch lists into Locations"
                    >
                      <RefreshCw size={13} />
                      {migratingGroupId === group.id ? "Migrating..." : "Migrate to Locations"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          className="btn btn-secondary row"
          onClick={() => setShowGroupForm((value) => !value)}
        >
          <Plus size={16} />
          {showGroupForm ? "Cancel" : "New group"}
        </button>

        {showGroupForm && (
          <form className="stack" onSubmit={createGroup}>
            <label>
              Group name
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Rossi Hospitality Group"
              />
            </label>
            <label>
              Owner name (optional)
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Marco Rossi"
                autoComplete="name"
              />
            </label>
            <label>
              Owner email (optional)
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="owner@email.com"
                autoComplete="email"
              />
            </label>

            {groupError && <div className="error">{groupError}</div>}

            <button className="btn btn-primary btn-wide" disabled={groupBusy}>
              {groupBusy ? "Creating..." : "Create group"}
            </button>
          </form>
        )}

        {lastGroupUrl && (
          <div className="notice stack">
            <strong>Group created.</strong>
            <span className="small">
              Assign locations to it below, or from each project's card in
              the list. Two links to send out:
            </span>
            <div>
              <p className="small" style={{ margin: "0 0 4px" }}>
                Owner (sees every location):
              </p>
              <code style={{ wordBreak: "break-all" }}>{lastGroupUrl}</code>
              <button
                className="btn btn-secondary"
                style={{ marginTop: 6 }}
                onClick={() => navigator.clipboard.writeText(lastGroupUrl)}
              >
                Copy owner link
              </button>
            </div>
            <div>
              <p className="small" style={{ margin: "0 0 4px" }}>
                Managers (pick their own location, one link for everyone):
              </p>
              <code style={{ wordBreak: "break-all" }}>{lastGroupUrl}/select</code>
              <button
                className="btn btn-secondary"
                style={{ marginTop: 6 }}
                onClick={() => navigator.clipboard.writeText(`${lastGroupUrl}/select`)}
              >
                Copy manager link
              </button>
            </div>
          </div>
        )}
          </>
        )}
      </section>

      <section className="card stack">
        <button
          className="row between"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            width: "100%",
            textAlign: "left",
            cursor: "pointer"
          }}
          onClick={() => setShowLocationsPanel((value) => !value)}
        >
          <div className="row">
            <MapPin size={20} />
            <div>
              <strong>Locations (places with multiple rounds)</strong>
              <p className="small" style={{ marginTop: 4, marginBottom: 0 }}>
                {locations.length} location{locations.length === 1 ? "" : "s"}{" "}
                — tap to {showLocationsPanel ? "collapse" : "expand"}
              </p>
            </div>
          </div>
          <ChevronDown
            size={18}
            style={{
              transform: showLocationsPanel ? "rotate(180deg)" : "none",
              transition: "transform .15s ease"
            }}
          />
        </button>

        {showLocationsPanel && (
          <>
            <p className="small" style={{ marginTop: 0 }}>
              For one place that gets several separate jobs over time (e.g.
              electrical, then plumbing, then painting). Each round keeps its
              own items, photos and report — the location link always opens
              the current one, with past rounds kept as history.
            </p>

            {!loadingLocations && locations.length > 0 && (
          <div className="stack">
            {locations.map((location) => (
              <div key={location.id} className="row between">
                <Link
                  href={`/location/${location.id}`}
                  style={{ textDecoration: "none", color: "inherit", flex: 1 }}
                >
                  <div className="row">
                    <strong style={{ fontSize: 14 }}>{location.name}</strong>
                    {newRoundsByLocation[location.id] > 0 && (
                      <span className="badge badge-open">
                        +{newRoundsByLocation[location.id]} new
                      </span>
                    )}
                  </div>
                  <div className="small">
                    {(() => {
                      const stats = roundStatsByLocation[location.id] || {
                        open: 0,
                        total: location.roundIds?.length || 0
                      };
                      return (
                        <>
                          {stats.open} open · {stats.total} round
                          {stats.total === 1 ? "" : "s"} — tap to open
                        </>
                      );
                    })()}
                  </div>
                </Link>
                <div className="row">
                  <button
                    className="btn btn-secondary row"
                    style={{ fontSize: 12 }}
                    disabled={startingRoundId === location.id}
                    onClick={(e) => {
                      e.preventDefault();
                      handleStartRound(location);
                    }}
                  >
                    <Plus size={13} />
                    {startingRoundId === location.id ? "Starting..." : "Start round"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 12 }}
                    onClick={(e) => {
                      e.preventDefault();
                      navigator.clipboard.writeText(
                        `${window.location.origin}/location/${location.id}`
                      );
                    }}
                  >
                    Copy link
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          className="btn btn-secondary row"
          onClick={() => setShowLocationForm((value) => !value)}
        >
          <Plus size={16} />
          {showLocationForm ? "Cancel" : "New location"}
        </button>

        {showLocationForm && (
          <form className="stack" onSubmit={createLocation}>
            <label>
              Location name
              <input
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g. Fiorellas Belmont"
              />
            </label>
            <label>
              Address (optional)
              <input
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
                placeholder="263 Belmont St, Belmont MA"
                autoComplete="street-address"
              />
            </label>
            {groups.length > 0 && (
              <label>
                Group (optional)
                <select
                  value={locationGroupId}
                  onChange={(e) => setLocationGroupId(e.target.value)}
                >
                  <option value="">No group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {locationError && <div className="error">{locationError}</div>}

            <button className="btn btn-primary btn-wide" disabled={locationBusy}>
              {locationBusy ? "Creating..." : "Create location"}
            </button>
          </form>
        )}

        {lastLocationUrl && (
          <div className="notice stack">
            <strong>Location created.</strong>
            <span className="small">
              Share this link — it always opens whatever round is currently
              active there. Start the first round from the location page, or
              from the form below with this location selected.
            </span>
            <code style={{ wordBreak: "break-all" }}>{lastLocationUrl}</code>
            <button
              className="btn btn-secondary"
              onClick={() => navigator.clipboard.writeText(lastLocationUrl)}
            >
              Copy link
            </button>
          </div>
        )}
          </>
        )}
      </section>

      <section className="card stack">
        <label style={{ margin: 0 }}>
          <span className="row">
            <Search size={15} />
            Search projects
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer name or address"
          />
        </label>
      </section>

      <section style={{ marginTop: 16 }}>
        <p className="small" style={{ margin: "0 0 8px" }}>
          Standalone punch lists (not part of a group or location — those
          live inside their own sections above)
        </p>
        {loadingProjects ? (
          <div className="card empty">Loading projects...</div>
        ) : filteredProjects.length === 0 ? (
          <div className="card empty">
            {search.trim() === ""
              ? "No standalone punch lists yet. Ones tied to a Location or Group show up in those sections instead."
              : "No punch lists match your search."}
          </div>
        ) : (
          filteredProjects.map((project) => {
            const percent =
              project.itemCount === 0
                ? 0
                : Math.round((project.completedCount / project.itemCount) * 100);

            return (
              <Link
                key={project.id}
                href={`/project/${project.id}`}
                className="card project-row"
                style={{ display: "block", marginTop: 12 }}
              >
                <div className="row between">
                  <div>
                    <strong>{project.customerName || "Waiting for customer info"}</strong>
                    <div className="small">{project.address || "Address pending"}</div>
                  </div>
                  <div className="row">
                    {project.status === "closed" && (
                      <span className="badge badge-neutral">Closed</span>
                    )}
                    <button
                      className="btn btn-secondary"
                      style={{ padding: "6px 8px" }}
                      disabled={deletingId === project.id}
                      onClick={(e) => handleDelete(e, project)}
                      title="Delete permanently"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <p className="small" style={{ marginTop: 8, marginBottom: 4 }}>
                  {project.completedCount} of {project.itemCount} items completed (
                  {percent}%)
                </p>
                {project.createdAt && (
                  <p className="small" style={{ margin: 0 }}>
                    Created {project.createdAt.toDate().toLocaleDateString()}
                  </p>
                )}
                {groups.length > 0 && (
                  <select
                    value={project.groupId || ""}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onChange={(e) =>
                      handleAssignGroup(project.id, e.target.value, project.groupId)
                    }
                    style={{ marginTop: 8, fontSize: 12, padding: "6px 8px" }}
                  >
                    <option value="">No group</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                )}
              </Link>
            );
          })
        )}
      </section>

      <section className="card stack" style={{ marginTop: 16 }}>
        <button
          className="btn btn-secondary row"
          onClick={() => setShowForm((value) => !value)}
        >
          <Plus size={16} />
          {showForm ? "Cancel" : "Or create a punch list manually"}
        </button>

        {showForm && (
          <>
            <div>
              <ClipboardCheck size={30} />
              <h2 style={{ marginBottom: 4 }}>New punch list</h2>
              <p className="small">
                If you already know the customer's info, fill it in below. Or
                leave it blank and generate the link right away — the
                customer fills in their own name, email and address the
                first time they open it (handy for customers with more
                than one job site).
              </p>
            </div>

            <form className="stack" onSubmit={createProject}>
              <label>
                Customer name (optional)
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Leave blank for the customer to fill in"
                  autoComplete="name"
                />
              </label>

              <label>
                Customer email (optional)
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="customer@email.com"
                  autoComplete="email"
                />
              </label>

              <label>
                Job site address (optional)
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Leave blank for the customer to fill in"
                  autoComplete="street-address"
                />
              </label>

              {locations.length > 0 && (
                <label>
                  Location (optional — for places with multiple rounds)
                  <select
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                  >
                    <option value="">No location — standalone punch list</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {groups.length > 0 && !selectedLocationId && (
                <label>
                  Group (optional)
                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                  >
                    <option value="">No group</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {error && <div className="error">{error}</div>}

              <button className="btn btn-primary btn-wide" disabled={busy}>
                {busy ? "Creating..." : "Create punch list & generate link"}
              </button>
            </form>

            {lastProjectUrl && (
              <div className="notice stack">
                <strong>Punch list created.</strong>
                <span className="small">Send this link to the customer:</span>
                <code style={{ wordBreak: "break-all" }}>{lastProjectUrl}</code>
                <button
                  className="btn btn-secondary"
                  onClick={() => navigator.clipboard.writeText(lastProjectUrl)}
                >
                  Copy link
                </button>
              </div>
            )}
          </>
        )}
      </section>
      <BrandFooter />
    </main>
  );
}
