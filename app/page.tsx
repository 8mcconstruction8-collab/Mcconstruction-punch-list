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
import { Building2, ClipboardCheck, LogOut, Plus, Search, Trash2 } from "lucide-react";
import {
  checkIsContractor,
  db,
  deleteProjectCompletely,
  signOutContractor,
  watchAuthState
} from "@/lib/firebase";
import type { Group, Project, ProjectStatus } from "@/lib/types";
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
  const [groupName, setGroupName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [lastGroupUrl, setLastGroupUrl] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");

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
  }, [contractor]);

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
      const project = await addDoc(collection(db, "projects"), {
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || null,
        address: address.trim(),
        contractorName: "MC Construction & Improvement",
        contractorUid: contractor.uid,
        groupId: selectedGroupId || null,
        status: "open" as ProjectStatus,
        createdAt: serverTimestamp()
      });

      if (selectedGroupId) {
        await updateDoc(doc(db, "groups", selectedGroupId), {
          projectIds: arrayUnion(project.id)
        });
      }

      setCustomerName("");
      setCustomerEmail("");
      setAddress("");
      setLastProjectUrl(`${window.location.origin}/project/${project.id}`);
      loadProjects(contractor.uid);
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

  const filteredProjects = projects.filter((project) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      project.customerName.toLowerCase().includes(term) ||
      project.address.toLowerCase().includes(term)
    );
  });

  return (
    <main className="shell">
      <header className="brand">
        <img src="/brand/rounds-mark.png" alt="Rounds" className="logo" />
        <div>
          <h1>Rounds</h1>
          
        </div>
        <button
          className="btn btn-secondary row"
          style={{ marginLeft: "auto" }}
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
        <div className="row">
          <Building2 size={20} />
          <div>
            <strong>Groups (owners with multiple locations)</strong>
            <p className="small" style={{ marginTop: 4, marginBottom: 0 }}>
              For customers with more than one job site. Two links per group:
              one for the owner, showing every location together — and one
              shared link for all managers, where each picks their own
              location before starting its punch list.
            </p>
          </div>
        </div>

        {!loadingGroups && groups.length > 0 && (
          <div className="stack">
            {groups.map((group) => (
              <div key={group.id} className="row between">
                <div>
                  <strong style={{ fontSize: 14 }}>{group.name}</strong>
                  <div className="small">
                    {group.projectIds?.length || 0} location
                    {group.projectIds?.length === 1 ? "" : "s"}
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
        {loadingProjects ? (
          <div className="card empty">Loading projects...</div>
        ) : filteredProjects.length === 0 ? (
          <div className="card empty">
            {projects.length === 0
              ? "No projects yet. Create your first punch list below."
              : "No projects match your search."}
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

              {groups.length > 0 && (
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
