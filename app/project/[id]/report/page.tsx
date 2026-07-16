"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { ArrowLeft, Printer } from "lucide-react";
import {
  checkIsContractor,
  db,
  ensureAnonymousAuth,
  watchAuthState
} from "@/lib/firebase";
import {
  PUNCH_CATEGORIES,
  PUNCH_PRIORITIES,
  type Project,
  type PunchItem,
  type PunchStatus
} from "@/lib/types";
import SignaturePad from "@/components/SignaturePad";

const statusLabel: Record<PunchStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed"
};

const statusClass: Record<PunchStatus, string> = {
  open: "badge badge-open",
  in_progress: "badge badge-progress",
  completed: "badge badge-done"
};

const categoryLabel = Object.fromEntries(
  PUNCH_CATEGORIES.map((option) => [option.value, option.label])
);
const priorityLabel = Object.fromEntries(
  PUNCH_PRIORITIES.map((option) => [option.value, option.label])
);

export default function ReportPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<PunchItem[]>([]);
  const [isContractor, setIsContractor] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = watchAuthState(async (authUser) => {
      const activeUser = authUser || (await ensureAnonymousAuth());
      const contractorAccount = activeUser
        ? await checkIsContractor(activeUser.uid)
        : false;
      setIsContractor(contractorAccount);
      setReady(true);
    });
    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!ready) return;

    const unsubscribeProject = onSnapshot(
      doc(db, "projects", projectId),
      (snapshot) => {
        if (snapshot.exists()) {
          setProject({ id: snapshot.id, ...snapshot.data() } as Project);
        }
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
  }, [projectId, ready]);

  async function saveSignature(
    kind: "customer" | "contractor",
    dataUrl: string,
    name: string
  ) {
    const field = kind === "customer" ? "customerSignature" : "contractorSignature";
    const nameField =
      kind === "customer" ? "customerSignedName" : "contractorSignedName";
    const atField = kind === "customer" ? "customerSignedAt" : "contractorSignedAt";

    await updateDoc(doc(db, "projects", projectId), {
      [field]: dataUrl,
      [nameField]: name,
      [atField]: serverTimestamp()
    });
  }

  if (loading || !ready) {
    return <main className="shell loading">Loading report...</main>;
  }

  if (!project) {
    return <main className="shell loading">Project not found.</main>;
  }

  const completedCount = items.filter((item) => item.status === "completed").length;

  return (
    <main className="shell report">
      <div className="row between no-print" style={{ marginBottom: 16 }}>
        <Link href={`/project/${projectId}`} className="btn btn-secondary row">
          <ArrowLeft size={16} />
          Back
        </Link>
        <button className="btn btn-primary row" onClick={() => window.print()}>
          <Printer size={16} />
          Generate PDF
        </button>
      </div>

      <header className="report-header">
        <div className="logo">MC</div>
        <div>
          <h1 style={{ margin: 0 }}>{project.contractorName}</h1>
          <p className="small" style={{ margin: 0 }}>
            Punch List — Final Report
          </p>
        </div>
      </header>

      <section className="card report-meta">
        <div className="grid2">
          <div>
            <p className="small" style={{ margin: 0 }}>
              Customer
            </p>
            <strong>{project.customerName}</strong>
          </div>
          <div>
            <p className="small" style={{ margin: 0 }}>
              Address
            </p>
            <strong>{project.address}</strong>
          </div>
          <div>
            <p className="small" style={{ margin: 0 }}>
              Status
            </p>
            <strong>{project.status === "closed" ? "Closed" : "Open"}</strong>
          </div>
          <div>
            <p className="small" style={{ margin: 0 }}>
              Items completed
            </p>
            <strong>
              {completedCount} of {items.length}
            </strong>
          </div>
        </div>
        {project.closedAt && (
          <p className="small" style={{ marginTop: 10, marginBottom: 0 }}>
            Closed on {project.closedAt.toDate().toLocaleDateString()}
          </p>
        )}
      </section>

      <section className="stack" style={{ marginTop: 20 }}>
        {items.map((item, index) => (
          <article key={item.id} className="card report-item">
            <div className="row between">
              <h3 style={{ margin: 0 }}>
                {index + 1}. {item.title || item.description}
              </h3>
              <span className={statusClass[item.status || "open"]}>
                {statusLabel[item.status || "open"]}
              </span>
            </div>

            <p className="small" style={{ margin: "6px 0" }}>
              {item.category ? categoryLabel[item.category] || item.category : ""}
              {item.priority
                ? ` · ${priorityLabel[item.priority] || item.priority} priority`
                : ""}
              {item.room ? ` · ${item.room}` : ""}
            </p>

            {item.title && <p style={{ margin: "0 0 10px" }}>{item.description}</p>}

            <div className="grid2">
              <div>
                <p className="photo-label">Before</p>
                {item.customerPhotos?.length ? (
                  <div className="photos">
                    {item.customerPhotos.map((url, i) => (
                      <img key={url} className="photo" src={url} alt={`Before ${i + 1}`} />
                    ))}
                  </div>
                ) : (
                  <p className="small">No photos</p>
                )}
              </div>
              <div>
                <p className="photo-label">After</p>
                {item.contractorPhotos?.length ? (
                  <div className="photos">
                    {item.contractorPhotos.map((url, i) => (
                      <img key={url} className="photo" src={url} alt={`After ${i + 1}`} />
                    ))}
                  </div>
                ) : (
                  <p className="small">No photos</p>
                )}
              </div>
            </div>

            <div className="divider" style={{ margin: "12px 0" }} />

            <p className="photo-label">Contractor evaluation</p>
            <p style={{ margin: 0 }}>
              {item.contractorAssessment || "Awaiting contractor evaluation."}
            </p>
          </article>
        ))}
      </section>

      <section className="card stack" style={{ marginTop: 20 }}>
        <h3 style={{ margin: 0 }}>Signatures</h3>
        <div className="grid2">
          <SignaturePad
            label="Customer signature"
            savedImage={project.customerSignature}
            savedName={project.customerSignedName}
            savedAt={project.customerSignedAt}
            canEdit={!isContractor}
            onSave={(dataUrl, name) => saveSignature("customer", dataUrl, name)}
          />
          <SignaturePad
            label="Contractor signature"
            savedImage={project.contractorSignature}
            savedName={project.contractorSignedName}
            savedAt={project.contractorSignedAt}
            canEdit={isContractor}
            onSave={(dataUrl, name) => saveSignature("contractor", dataUrl, name)}
          />
        </div>
      </section>
    </main>
  );
}
