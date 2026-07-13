"use client";

import { FormEvent, MouseEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addDoc,
  collection,
  getCountFromServer,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where
} from "firebase/firestore";
import { ClipboardCheck, LogOut, Plus, Search, Trash2 } from "lucide-react";
import {
  checkIsContractor,
  db,
  deleteProjectCompletely,
  signOutContractor,
  watchAuthState
} from "@/lib/firebase";
import type { Project, ProjectStatus } from "@/lib/types";
import type { User } from "firebase/auth";

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
  }, [contractor]);

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
        status: "open" as ProjectStatus,
        createdAt: serverTimestamp()
      });

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
        <img src="/brand/logo-mark.png" alt="MC Construction" className="logo" />
        <div>
          <h1>MC Punch List</h1>
          <p>Project closeout management</p>
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
    </main>
  );
}
