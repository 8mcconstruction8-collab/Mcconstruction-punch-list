"use client";

import { FormEvent, useEffect, useState } from "react";
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
import { ClipboardCheck, LogOut, Plus, Search } from "lucide-react";
import {
  checkIsContractor,
  db,
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

    if (!customerName.trim() || !address.trim()) {
      setError("Preencha o nome do cliente e o endereço da obra.");
      return;
    }

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
      setError("Não foi possível criar a punch list. Confira a configuração do Firebase.");
    } finally {
      setBusy(false);
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
        <div className="logo">MC</div>
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
                    <strong>{project.customerName}</strong>
                    <div className="small">{project.address}</div>
                  </div>
                  {project.status === "closed" && (
                    <span className="badge badge-neutral">Closed</span>
                  )}
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
          {showForm ? "Cancel" : "New punch list"}
        </button>

        {showForm && (
          <>
            <div>
              <ClipboardCheck size={30} />
              <h2 style={{ marginBottom: 4 }}>Nova punch list</h2>
              <p className="small">
                Cadastre o cliente e a obra para começar a lista de correções.
              </p>
            </div>

            <form className="stack" onSubmit={createProject}>
              <label>
                Nome do cliente
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ex.: John Smith"
                  autoComplete="name"
                />
              </label>

              <label>
                E-mail do cliente (opcional)
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  autoComplete="email"
                />
              </label>

              <label>
                Endereço da obra
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex.: 123 Main St, Worcester, MA"
                  autoComplete="street-address"
                />
              </label>

              {error && <div className="error">{error}</div>}

              <button className="btn btn-primary btn-wide" disabled={busy}>
                {busy ? "Criando..." : "Criar punch list"}
              </button>
            </form>

            {lastProjectUrl && (
              <div className="notice stack">
                <strong>Punch list criada.</strong>
                <span className="small">Envie este link para o cliente:</span>
                <code style={{ wordBreak: "break-all" }}>{lastProjectUrl}</code>
                <button
                  className="btn btn-secondary"
                  onClick={() => navigator.clipboard.writeText(lastProjectUrl)}
                >
                  Copiar link
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
