"use client";

import { use, useEffect, useMemo, useState } from "react";
import { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  ArrowLeft,
  Archive,
  Camera,
  ClipboardPlus,
  Copy,
  FileText,
  Lock,
  LogIn,
  LogOut,
  MapPin,
  Plus,
  Trash2,
  Unlock
} from "lucide-react";
import {
  checkIsContractor,
  db,
  deleteProjectCompletely,
  ensureAnonymousAuth,
  notifyContractor,
  signOutContractor,
  storage,
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
import BrandFooter from "@/components/BrandFooter";
import InstallAppButton from "@/components/InstallAppButton";

export default function ProjectPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [locationGroupId, setLocationGroupId] = useState<string | null>(null);
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
  const [intakeName, setIntakeName] = useState("");
  const [intakeEmail, setIntakeEmail] = useState("");
  const [intakeAddress, setIntakeAddress] = useState("");
  const [savingIntake, setSavingIntake] = useState(false);
  const [intakeError, setIntakeError] = useState("");
  const [managerNameInput, setManagerNameInput] = useState("");
  const [savingManagerName, setSavingManagerName] = useState(false);
  const [showManagerNameEdit, setShowManagerNameEdit] = useState(false);
  const [newItemPhotos, setNewItemPhotos] = useState<File[]>([]);

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
          const projectData = { id: snapshot.id, ...snapshot.data() } as Project;
          setProject(projectData);

          if (projectData.locationId) {
            getDoc(doc(db, "locations", projectData.locationId))
              .then((locationSnap) => {
                setLocationGroupId(
                  locationSnap.exists() ? locationSnap.data().groupId || null : null
                );
              })
              .catch((err) => console.error(err));
          } else {
            setLocationGroupId(null);
          }
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

  const [showArchived, setShowArchived] = useState(false);

  const completedCount = useMemo(
    () =>
      items.filter((item) => item.status === "completed" || item.status === "archived")
        .length,
    [items]
  );
  const archivedCount = useMemo(
    () => items.filter((item) => item.status === "archived").length,
    [items]
  );
  const visibleItems = useMemo(
    () => (showArchived ? items : items.filter((item) => item.status !== "archived")),
    [items, showArchived]
  );

  async function addItem(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setAdding(true);
    try {
      const itemDoc = await addDoc(collection(db, "projects", projectId, "items"), {
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

      if (newItemPhotos.length > 0) {
        const kind = isContractor ? "contractor" : "customer";
        const urls = await Promise.all(
          newItemPhotos.map(async (file) => {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const fileRef = ref(
              storage,
              `projects/${projectId}/${itemDoc.id}/${kind}/${unique}-${safeName}`
            );
            await uploadBytes(fileRef, file, { contentType: file.type });
            return getDownloadURL(fileRef);
          })
        );
        await updateDoc(itemDoc, {
          [kind === "customer" ? "customerPhotos" : "contractorPhotos"]: urls,
          updatedAt: serverTimestamp()
        });
      }

      setTitle("");
      setDescription("");
      setRoom("");
      setCategory("other");
      setPriority("medium");
      setNewItemPhotos([]);

      if (!isContractor && project) {
        const who = project.customerName || "Someone";
        const photoNote =
          newItemPhotos.length === 0
            ? ""
            : newItemPhotos.length === 1
              ? " with a photo"
              : ` with ${newItemPhotos.length} photos`;
        const subject = `New item — ${project.customerName || "Rounds"}: ${title.trim()}`;
        const body = [
          `${who} added a new punch-list item${photoNote}.`,
          `<strong>${title.trim()}</strong> — ${description.trim()}`,
          `<a href="${window.location.origin}/project/${projectId}">Open the punch list</a>`
        ];
        notifyContractor(projectId, project.contractorNotifyEmail, subject, body);
      }
    } catch (err) {
      console.error(err);
      alert("Item was created, but the photo couldn't be uploaded. You can add it from the item card below.");
    } finally {
      setAdding(false);
    }
  }

  async function saveIntake(event: FormEvent) {
    event.preventDefault();
    setIntakeError("");

    if (!intakeName.trim() || !intakeAddress.trim()) {
      setIntakeError("Please fill in at least your name and the job site address.");
      return;
    }

    setSavingIntake(true);
    try {
      await updateDoc(doc(db, "projects", projectId), {
        customerName: intakeName.trim(),
        customerEmail: intakeEmail.trim() || null,
        address: intakeAddress.trim()
      });

      const subject = `New customer info — ${intakeName.trim()}`;
      const body = [
        `${intakeName.trim()} filled in their info for a punch list.`,
        `Address: ${intakeAddress.trim()}`,
        intakeEmail.trim() ? `Email: ${intakeEmail.trim()}` : "",
        `<a href="${window.location.origin}/project/${projectId}">Open the punch list</a>`
      ].filter(Boolean);
      notifyContractor(projectId, project?.contractorNotifyEmail, subject, body);
    } catch (err) {
      console.error(err);
      setIntakeError("Couldn't save. Please try again.");
    } finally {
      setSavingIntake(false);
    }
  }

  async function saveManagerName(event: FormEvent) {
    event.preventDefault();
    if (!managerNameInput.trim()) return;

    setSavingManagerName(true);
    try {
      await updateDoc(doc(db, "projects", projectId), {
        managerName: managerNameInput.trim()
      });
    } catch (err) {
      console.error(err);
      alert("Couldn't save your name. Please try again.");
    } finally {
      setSavingManagerName(false);
    }
  }

  async function handleStartNewRound() {
    if (!project?.locationId) return;

    const label = prompt(
      "What's this new round for? (e.g. Electrical, Plumbing, Painting)"
    );
    if (label === null) return; // cancelled

    try {
      const locationSnap = await getDoc(doc(db, "locations", project.locationId));
      if (!locationSnap.exists()) {
        alert("Couldn't find the location for this punch list.");
        return;
      }
      const location = locationSnap.data();

      const roundDoc = await addDoc(collection(db, "projects"), {
        customerName: location.name,
        address: location.address || "",
        contractorName: "MC Construction & Improvement",
        contractorUid: location.contractorUid,
        contractorNotifyEmail: location.contractorNotifyEmail || null,
        ownerNotifyEmail: location.ownerNotifyEmail || null,
        groupId: location.groupId || null,
        locationId: project.locationId,
        roundLabel: label.trim() || `Round ${(location.roundIds?.length || 0) + 1}`,
        status: "open",
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, "locations", project.locationId), {
        roundIds: arrayUnion(roundDoc.id)
      });

      if (!isContractor) {
        const subject = `New round started — ${location.name}`;
        const body = [
          `${project.customerName || "Someone"} started a new round at ${location.name}: <strong>${label.trim() || "Untitled round"}</strong>.`,
          `<a href="${window.location.origin}/project/${roundDoc.id}">Open the punch list</a>`
        ];
        notifyContractor(roundDoc.id, location.contractorNotifyEmail, subject, body);
      }

      router.push(`/project/${roundDoc.id}`);
    } catch (err) {
      console.error(err);
      alert("Couldn't start a new round. Please try again.");
    }
  }

  async function handleDeleteRound() {
    if (!project) return;
    const label = project.roundLabel || project.customerName || "this punch list";
    const confirmed = confirm(
      `Delete "${label}" forever? This removes every item and photo. This can't be undone.`
    );
    if (!confirmed) return;

    try {
      await deleteProjectCompletely(projectId);
      router.push(project.locationId ? `/location/${project.locationId}` : "/");
    } catch (err) {
      console.error(err);
      alert("Couldn't delete. Please try again.");
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
      !confirm("Close this punch list? The customer will no longer be able to add items or photos.")
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

  const needsCustomerInfo =
    !isContractor && (!project.customerName?.trim() || !project.address?.trim());

  if (needsCustomerInfo) {
    return (
      <main className="shell">
        <header className="brand">
          <img src="/brand/rounds-mark.png" alt="Rounds" className="logo" />
          <div>
            <h1>Rounds</h1>
            
          </div>
        </header>

        <section className="card stack">
          <div>
            <h2 style={{ marginBottom: 4 }}>Welcome</h2>
            <p className="small">
              Before we get started, we need a few details about you and the job site.
            </p>
          </div>

          <form className="stack" onSubmit={saveIntake}>
            <label>
              Your name
              <input
                value={intakeName}
                onChange={(e) => setIntakeName(e.target.value)}
                placeholder="Ex.: John Smith"
                autoComplete="name"
              />
            </label>

            <label>
              Email (optional)
              <input
                type="email"
                value={intakeEmail}
                onChange={(e) => setIntakeEmail(e.target.value)}
                placeholder="you@email.com"
                autoComplete="email"
              />
            </label>

            <label>
              Job site address
              <input
                value={intakeAddress}
                onChange={(e) => setIntakeAddress(e.target.value)}
                placeholder="Ex.: 123 Main St, Worcester, MA"
                autoComplete="street-address"
              />
            </label>

            {intakeError && <div className="error">{intakeError}</div>}

            <button className="btn btn-primary btn-wide" disabled={savingIntake}>
              {savingIntake ? "Saving..." : "Continue"}
            </button>
          </form>
        </section>
        <BrandFooter />
      </main>
    );
  }

  const needsManagerName =
    !isContractor && !!project.locationId && !project.managerName?.trim();

  if (needsManagerName) {
    return (
      <main className="shell">
        <header className="brand">
          <img src="/brand/rounds-mark.png" alt="Rounds" className="logo" />
          <div>
            <h1>Rounds</h1>
            
          </div>
        </header>

        <section className="card stack">
          <div>
            <h2 style={{ marginBottom: 4 }}>Who's this?</h2>
            <p className="small">
              This location shares one link between managers — your name
              helps the team know who's working this punch list.
            </p>
          </div>

          <form className="stack" onSubmit={saveManagerName}>
            <label>
              Your name
              <input
                value={managerNameInput}
                onChange={(e) => setManagerNameInput(e.target.value)}
                placeholder="Ex.: John Smith"
                autoComplete="name"
              />
            </label>

            <button className="btn btn-primary btn-wide" disabled={savingManagerName}>
              {savingManagerName ? "Saving..." : "Continue"}
            </button>
          </form>
        </section>
        <BrandFooter />
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="brand">
        <img src="/brand/rounds-mark.png" alt="Rounds" className="logo" />
        <div>
          <h1>Rounds</h1>
          
        </div>
      </header>

      <section className="project-head">
        {project.locationId && (
          <div className="row between no-print" style={{ marginBottom: 8, flexWrap: "wrap" }}>
            <Link
              href={`/location/${project.locationId}`}
              className="small row"
              style={{ display: "inline-flex" }}
            >
              <ArrowLeft size={14} />
              All rounds at this location
            </Link>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {locationGroupId && (
                <Link
                  href={`/group/${locationGroupId}/select`}
                  className="btn btn-secondary row"
                  style={{ fontSize: 12, padding: "6px 10px" }}
                >
                  <MapPin size={13} />
                  Back to locations
                </Link>
              )}
              <button
                className="btn btn-secondary row"
                style={{ fontSize: 12, padding: "6px 10px" }}
                onClick={handleStartNewRound}
              >
                <Plus size={13} />
                Start new round
              </button>
            </div>
          </div>
        )}
        <div className="row between">
          <div>
            <div className="row">
              <h2 style={{ margin: 0 }}>
                {project.customerName || "Waiting for customer info"}
              </h2>
              {project.status === "closed" && (
                <span className="badge badge-neutral">Closed</span>
              )}
            </div>
            <p>{project.address || "Address pending"}</p>
            {project.roundLabel && (
              <p className="small" style={{ margin: 0 }}>
                {project.roundLabel}
              </p>
            )}
            {project.locationId && (
              <div style={{ marginTop: 2 }}>
                {!showManagerNameEdit ? (
                  <p className="small" style={{ margin: 0 }}>
                    {project.managerName ? (
                      <>Manager: <strong>{project.managerName}</strong></>
                    ) : (
                      "Manager: not identified yet"
                    )}{" "}
                    <button
                      className="no-print"
                      type="button"
                      onClick={() => {
                        setManagerNameInput(project.managerName || "");
                        setShowManagerNameEdit(true);
                      }}
                      style={{
                        border: "none",
                        background: "none",
                        color: "#666",
                        textDecoration: "underline",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: 12
                      }}
                    >
                      edit
                    </button>
                  </p>
                ) : (
                  <form
                    className="row no-print"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await saveManagerName(e);
                      setShowManagerNameEdit(false);
                    }}
                  >
                    <input
                      value={managerNameInput}
                      onChange={(e) => setManagerNameInput(e.target.value)}
                      placeholder="Manager's name"
                      style={{ fontSize: 13, padding: "4px 8px" }}
                      autoFocus
                    />
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: "4px 10px" }}
                      disabled={savingManagerName}
                    >
                      {savingManagerName ? "..." : "Save"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: "4px 10px" }}
                      onClick={() => setShowManagerNameEdit(false)}
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </div>
            )}
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
            <InstallAppButton />
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
                  Close
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
            <button
              className="btn btn-secondary row"
              style={{ color: "#b42318" }}
              onClick={handleDeleteRound}
            >
              <Trash2 size={16} />
              Delete
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

            <div>
              <label className="btn btn-secondary row" style={{ display: "inline-flex" }}>
                <Camera size={17} />
                {newItemPhotos.length > 0
                  ? `Add more photos (${newItemPhotos.length} selected)`
                  : "Add photos (optional, up to 10)"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    const picked = Array.from(e.target.files || []);
                    if (picked.length === 0) return;
                    setNewItemPhotos((current) =>
                      [...current, ...picked].slice(0, 10)
                    );
                    e.target.value = "";
                  }}
                />
              </label>
              {newItemPhotos.length > 0 && (
                <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none" }}>
                  {newItemPhotos.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="small">
                      {file.name}{" "}
                      <button
                        type="button"
                        onClick={() =>
                          setNewItemPhotos((current) =>
                            current.filter((_, i) => i !== index)
                          )
                        }
                        style={{
                          border: "none",
                          background: "none",
                          color: "#b42318",
                          cursor: "pointer",
                          padding: 0,
                          marginLeft: 6
                        }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button className="btn btn-primary" disabled={adding}>
              {adding ? "Adding..." : "Add item"}
            </button>
          </form>
        </section>
      )}

      <section style={{ marginTop: 16 }}>
        {archivedCount > 0 && (
          <button
            className="btn btn-secondary row no-print"
            style={{ marginBottom: 12 }}
            onClick={() => setShowArchived((value) => !value)}
          >
            <Archive size={15} />
            {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
          </button>
        )}
        {visibleItems.length === 0 ? (
          <div className="card empty">
            {items.length === 0
              ? "No punch-list items yet."
              : "All items are archived. Tap \"Show archived\" above to see them."}
          </div>
        ) : (
          visibleItems.map((item) => (
            <PunchItemCard
              key={item.id}
              item={item}
              projectId={projectId}
              mode={isContractor ? mode : "customer"}
              projectClosed={project.status === "closed"}
              contractorNotifyEmail={project.contractorNotifyEmail}
              customerEmail={project.customerEmail}
              ownerNotifyEmail={project.ownerNotifyEmail}
              locationName={project.customerName}
            />
          ))
        )}
      </section>
      <BrandFooter />
    </main>
  );
}
