"use client";

import { use, useEffect, useMemo, useState } from "react";
import { FormEvent } from "react";
import Link from "next/link";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { ClipboardPlus, Copy, FileText, Lock, LogIn, LogOut, Unlock } from "lucide-react";
import {
  checkIsContractor,
  db,
  ensureAnonymousAuth,
  signOutContractor,
  watchAuthState
} from "@/lib/firebase";
import {
  PUNCH_CATEGORIES,
  PUNCH_PRIORITIES,
  type Project,
  type PunchCategory,
  type PunchItem,
  type PunchPriority
} from "@/lib/types";
import PunchItemCard from "@/components/PunchItemCard";

export default function ProjectPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<PunchItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [room, setRoom] = useState("");
  const [category, setCategory] = useState<PunchCategory>("other");
  const [priority, setPriority] = useState<PunchPriority>("medium");
  const [mode, setMode] = useState<"customer" | "contractor">("customer");
  const [user, setUser] = useState<User | null>(null);
  const [isContractor, setIsContractor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = watchAuthState(async (authUser) => {
      let activeUser = authUser;
      if (!activeUser) {
        activeUser = await ensureAnonymousAuth();
      }
      setUser(activeUser);

      const contractorAccount = activeUser
        ? await checkIsContractor(activeUser.uid)
        : false;
      setIsContractor(contractorAccount);
      setMode(contractorAccount ? "contractor" : "customer");
    });

    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubscribeProject = onSnapshot(
      doc(db, "projects", projectId),
      (snapshot) => {
        if (snapshot.exists()) {
          setProject({ id: snapshot.id, ...snapshot.data() } as Project);
        }
        setLoading(false);
      },
      (error) => {
        console.error(error);
        setLoading(false);
      }
    );

    const itemsQuery = query(
      collection(db, "projects", projectId, "items"),
      orderBy("createdAt", "asc")
    );

    const unsubscribeItems = onSnapshot(itemsQuery, (snapshot) => {
      setItems(
        snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PunchItem)
      );
    });

    return () => {
      unsubscribeProject();
      unsubscribeItems();
    };
  }, [projectId, user]);

  const completedCount = useMemo(
    () => items.filter((item) => item.status === "completed").length,
    [items]
  );

  async function addItem(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setAdding(true);
    try {
      await addDoc(collection(db, "projects", projectId, "items"), {
        projectId,
        title: title.trim(),
        description: description.trim(),
        room: room.trim(),
        category,
        priority,
        customerPhotos: [],
        contractorAssessment: "",
        contractorPhotos: [],
        status: "open",
        createdBy: isContractor ? "contractor" : "customer",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setTitle("");
      setDescription("");
      setRoom("");
      setCategory("other");
      setPriority("medium");
    } finally {
      setAdding(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    alert("Punch list link copied.");
  }

  async function toggleClosed() {
    if (!project) return;
    const nextStatus = project.status === "closed" ? "open" : "closed";
    if (
      nextStatus === "closed" &&
      !confirm("Encerrar esta punch list? O cliente não poderá mais adicionar itens ou fotos.")
    ) {
      return;
    }
    await updateDoc(doc(db, "projects", projectId), {
      status: nextStatus,
      closedAt: nextStatus === "closed" ? serverTimestamp() : null
    });
  }

  if (loading) {
    return <main className="shell loading">Loading punch list...</main>;
  }

  if (!project) {
    return <main className="shell loading">Project not found.</main>;
  }

  return (
    <main className="shell">
      <header className="brand">
        <div className="logo">MC</div>
        <div>
          <h1>MC Punch List</h1>
          <p>Project closeout management</p>
        </div>
      </header>

      <section className="project-head">
        <div className="row between">
          <div>
            <div className="row">
              <h2 style={{ margin: 0 }}>{project.customerName}</h2>
              {project.status === "closed" && (
                <span className="badge badge-neutral">Closed</span>
              )}
            </div>
            <p>{project.address}</p>
          </div>
          <div className="row">
            <Link href={`/project/${projectId}/report`} className="btn btn-secondary row">
              <FileText size={16} />
              Report
            </Link>
            <button className="btn btn-secondary row" onClick={copyLink}>
              <Copy size={16} />
              Share
            </button>
          </div>
        </div>
        <p className="small" style={{ marginTop: 10 }}>
          {completedCount} of {items.length} items completed
        </p>
      </section>

      <div className="tabs">
        <button
          className={`tab ${mode === "customer" ? "active" : ""}`}
          onClick={() => setMode("customer")}
        >
          Customer
        </button>
        {isContractor ? (
          <button
            className={`tab ${mode === "contractor" ? "active" : ""}`}
            onClick={() => setMode("contractor")}
          >
            Contractor
          </button>
        ) : (
          <Link href="/login" className="tab row">
            <LogIn size={14} />
            Contractor login
          </Link>
        )}
      </div>

      {isContractor && mode === "contractor" && (
        <div className="row between card">
          <div>
            <strong>Contractor mode</strong>
            <div className="small">Assess, update and close items.</div>
          </div>
          <div className="row">
            <button className="btn btn-secondary row" onClick={toggleClosed}>
              {project.status === "closed" ? (
                <>
                  <Unlock size={16} />
                  Reopen
                </>
              ) : (
                <>
                  <Lock size={16} />
                  Encerrar
                </>
              )}
            </button>
            <button
              className="btn btn-secondary row"
              onClick={async () => {
                await signOutContractor();
                setIsContractor(false);
                setMode("customer");
              }}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>
      )}

      {mode === "customer" && project.status === "closed" && (
        <section className="card notice">
          This punch list has been closed by the contractor. You can still view
          all items, but new items and photos can no longer be added.
        </section>
      )}

      {mode === "customer" && project.status !== "closed" && (
        <section className="card stack">
          <div className="row">
            <ClipboardPlus />
            <div>
              <h3 style={{ margin: 0 }}>Add punch-list item</h3>
              <p className="small" style={{ marginBottom: 0 }}>
                Describe one correction per item.
              </p>
            </div>
          </div>

          <form className="stack" onSubmit={addItem}>
            <label>
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Example: Paint touch-up"
              />
            </label>

            <label>
              Work description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Example: Touch up paint above the kitchen window."
              />
            </label>

            <div className="grid2">
              <label>
                Room / location
                <input
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="Kitchen"
                />
              </label>

              <label>
                Category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as PunchCategory)}
                >
                  {PUNCH_CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PunchPriority)}
              >
                {PUNCH_PRIORITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button className="btn btn-primary" disabled={adding}>
              {adding ? "Adding..." : "Add item"}
            </button>
          </form>
        </section>
      )}

      <section style={{ marginTop: 16 }}>
        {items.length === 0 ? (
          <div className="card empty">No punch-list items yet.</div>
        ) : (
          items.map((item) => (
            <PunchItemCard
              key={item.id}
              item={item}
              projectId={projectId}
              mode={isContractor ? mode : "customer"}
              projectClosed={project.status === "closed"}
            />
          ))
        )}
      </section>
    </main>
  );
}
