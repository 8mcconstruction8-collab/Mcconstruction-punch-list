"use client";

import { useState } from "react";
import {
  arrayUnion,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc
} from "firebase/firestore";
import { CheckCircle2, History, Save, Trash2 } from "lucide-react";
import { db, notifyContractor, notifyCustomer } from "@/lib/firebase";
import {
  PUNCH_CATEGORIES,
  PUNCH_PRIORITIES,
  type HistoryEntry,
  type PunchItem,
  type PunchStatus
} from "@/lib/types";
import PhotoUploader from "./PhotoUploader";

type Props = {
  item: PunchItem;
  projectId: string;
  mode: "customer" | "contractor";
  projectClosed?: boolean;
  contractorNotifyEmail?: string;
  customerEmail?: string;
};

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

const priorityClass: Record<string, string> = {
  low: "badge badge-priority-low",
  medium: "badge badge-priority-medium",
  high: "badge badge-priority-high"
};

const categoryLabel = Object.fromEntries(
  PUNCH_CATEGORIES.map((option) => [option.value, option.label])
);

const priorityLabel = Object.fromEntries(
  PUNCH_PRIORITIES.map((option) => [option.value, option.label])
);

export default function PunchItemCard({
  item,
  projectId,
  mode,
  projectClosed,
  contractorNotifyEmail,
  customerEmail
}: Props) {
  const [assessment, setAssessment] = useState(item.contractorAssessment || "");
  const [status, setStatus] = useState<PunchStatus>(item.status || "open");
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const itemRef = doc(db, "projects", projectId, "items", item.id);

  async function addPhoto(kind: "customer" | "contractor", urls: string[]) {
    if (urls.length === 0) return;

    const countLabel = urls.length > 1 ? `${urls.length} photos` : "a photo";
    const entry: HistoryEntry = {
      action:
        kind === "customer"
          ? `Customer added ${countLabel}`
          : `Contractor added ${countLabel} (completion)`,
      by: kind,
      at: Timestamp.now()
    };
    await updateDoc(itemRef, {
      [kind === "customer" ? "customerPhotos" : "contractorPhotos"]: arrayUnion(...urls),
      history: arrayUnion(entry),
      updatedAt: serverTimestamp()
    });

    if (kind === "customer") {
      notifyContractor(
        projectId,
        contractorNotifyEmail,
        `New photo${urls.length > 1 ? "s" : ""} — ${item.title || item.description}`,
        [
          `${countLabel === "a photo" ? "A new photo was" : `${countLabel} were`} added to "${item.title || item.description}".`,
          `<a href="${window.location.origin}/project/${projectId}">Open the punch list</a>`
        ]
      );
    }
  }

  async function saveContractorUpdate() {
    setSaving(true);
    try {
      const entries: HistoryEntry[] = [];
      if (status !== item.status) {
        entries.push({
          action: `Status changed to ${statusLabel[status]}`,
          by: "contractor",
          at: Timestamp.now()
        });
      }
      if (assessment.trim() !== (item.contractorAssessment || "")) {
        entries.push({
          action: "Contractor evaluation updated",
          by: "contractor",
          at: Timestamp.now()
        });
      }

      await updateDoc(itemRef, {
        contractorAssessment: assessment.trim(),
        status,
        ...(entries.length > 0 ? { history: arrayUnion(...entries) } : {}),
        updatedAt: serverTimestamp()
      });

      if (entries.length > 0) {
        notifyCustomer(
          projectId,
          customerEmail,
          `Update on your punch list — ${item.title || item.description}`,
          [
            `The contractor updated "${item.title || item.description}".`,
            `Status: <strong>${statusLabel[status]}</strong>`,
            assessment.trim() ? `Evaluation: ${assessment.trim()}` : "",
            `<a href="${window.location.origin}/project/${projectId}">View the punch list</a>`
          ].filter(Boolean)
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeItem() {
    if (!confirm("Remove this item?")) return;
    await deleteDoc(itemRef);
  }

  return (
    <article className="card item">
      <div className="item-top">
        <div>
          <p className="small">Customer request</p>
          <h3 className="item-title">{item.title || item.description}</h3>
        </div>
        <span className={statusClass[item.status || "open"]}>
          {statusLabel[item.status || "open"]}
        </span>
      </div>

      <div className="toolbar">
        {item.category && (
          <span className="badge badge-neutral">
            {categoryLabel[item.category] || item.category}
          </span>
        )}
        {item.priority && (
          <span className={priorityClass[item.priority] || "badge badge-neutral"}>
            {priorityLabel[item.priority] || item.priority} priority
          </span>
        )}
        {item.room && <span className="badge badge-neutral">{item.room}</span>}
      </div>

      {item.title && <p style={{ margin: 0 }}>{item.description}</p>}

      {item.customerPhotos?.length > 0 && (
        <div>
          <p className="photo-label">Customer photos</p>
          <div className="photos">
            {item.customerPhotos.map((url, index) => (
              <a href={url} target="_blank" rel="noreferrer" key={url}>
                <img className="photo" src={url} alt={`Customer upload ${index + 1}`} />
              </a>
            ))}
          </div>
        </div>
      )}

      {mode === "customer" && item.status !== "completed" && !projectClosed && (
        <PhotoUploader
          projectId={projectId}
          itemId={item.id}
          kind="customer"
          onUploaded={(urls) => addPhoto("customer", urls)}
        />
      )}

      <div className="divider" />

      <div>
        <p className="photo-label">MC Construction evaluation</p>
        {mode === "contractor" ? (
          <div className="stack">
            <textarea
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
              placeholder="Assessment, repair performed, materials, observations..."
            />

            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PunchStatus)}
              >
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </label>

            <div className="toolbar">
              <PhotoUploader
                projectId={projectId}
                itemId={item.id}
                kind="contractor"
                onUploaded={(urls) => addPhoto("contractor", urls)}
              />
              <button
                className="btn btn-success row"
                onClick={saveContractorUpdate}
                disabled={saving}
              >
                {status === "completed" ? <CheckCircle2 size={17} /> : <Save size={17} />}
                {saving ? "Saving..." : "Save update"}
              </button>
              <button className="btn btn-danger row" onClick={removeItem}>
                <Trash2 size={17} />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <p>{item.contractorAssessment || "Awaiting contractor evaluation."}</p>
        )}
      </div>

      {item.contractorPhotos?.length > 0 && (
        <div>
          <p className="photo-label">Completion photos</p>
          <div className="photos">
            {item.contractorPhotos.map((url, index) => (
              <a href={url} target="_blank" rel="noreferrer" key={url}>
                <img className="photo" src={url} alt={`Completion photo ${index + 1}`} />
              </a>
            ))}
          </div>
        </div>
      )}

      {item.history && item.history.length > 0 && (
        <div>
          <button
            className="btn btn-secondary row no-print"
            type="button"
            onClick={() => setShowHistory((value) => !value)}
          >
            <History size={15} />
            {showHistory ? "Hide history" : `History (${item.history.length})`}
          </button>

          {showHistory && (
            <ul className="history-list">
              {[...item.history]
                .sort((a, b) => a.at.toMillis() - b.at.toMillis())
                .map((entry, index) => (
                  <li key={index} className="small">
                    <strong>{entry.by === "contractor" ? "Contractor" : "Customer"}</strong>{" "}
                    — {entry.action} · {entry.at.toDate().toLocaleString()}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
