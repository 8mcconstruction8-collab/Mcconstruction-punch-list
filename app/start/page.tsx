"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { DEFAULT_CONTRACTOR_NOTIFY_EMAIL, db, ensureAnonymousAuth } from "@/lib/firebase";
import type { ProjectStatus } from "@/lib/types";
import BrandFooter from "@/components/BrandFooter";

const DEFAULT_CONTRACTOR_UID = process.env.NEXT_PUBLIC_DEFAULT_CONTRACTOR_UID;

export default function StartPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    async function createAndRedirect() {
      if (!DEFAULT_CONTRACTOR_UID) {
        setError(
          "This link isn't configured yet. Ask MC Construction to finish setup."
        );
        return;
      }

      try {
        await ensureAnonymousAuth();
        const project = await addDoc(collection(db, "projects"), {
          customerName: "",
          customerEmail: null,
          address: "",
          contractorName: "MC Construction & Improvement",
          contractorUid: DEFAULT_CONTRACTOR_UID,
          contractorNotifyEmail: DEFAULT_CONTRACTOR_NOTIFY_EMAIL,
          status: "open" as ProjectStatus,
          createdAt: serverTimestamp()
        });
        router.replace(`/project/${project.id}`);
      } catch (err) {
        console.error(err);
        setError("Something went wrong starting your punch list. Please try again.");
      }
    }

    createAndRedirect();
  }, [router]);

  return (
    <main className="shell">
      <header className="brand">
        <img src="/brand/rounds-mark.png" alt="Rounds" className="logo" />
        <div>
          <h1>Rounds</h1>
          
        </div>
      </header>

      <section className="card stack">
        {error ? (
          <div className="error">{error}</div>
        ) : (
          <p>Setting up your punch list...</p>
        )}
      </section>
      <BrandFooter />
    </main>
  );
}
