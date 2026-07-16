"use client";

import { ChangeEvent, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Camera, LoaderCircle } from "lucide-react";
import { storage } from "@/lib/firebase";

type Props = {
  projectId: string;
  itemId: string;
  kind: "customer" | "contractor";
  onUploaded: (url: string) => Promise<void>;
};

export default function PhotoUploader({
  projectId,
  itemId,
  kind,
  onUploaded
}: Props) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert("Photo must be 10 MB or smaller.");
      return;
    }

    try {
      setUploading(true);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileRef = ref(
        storage,
        `projects/${projectId}/${itemId}/${kind}/${Date.now()}-${safeName}`
      );
      await uploadBytes(fileRef, file, { contentType: file.type });
      const url = await getDownloadURL(fileRef);
      await onUploaded(url);
    } catch (error) {
      console.error(error);
      alert("Couldn't upload the photo.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <label className="btn btn-secondary row" style={{ display: "inline-flex" }}>
      {uploading ? <LoaderCircle size={17} /> : <Camera size={17} />}
      {uploading ? "Uploading..." : "Add photo"}
      <input
        type="file"
        accept="image/*"
        onChange={handleFile}
        disabled={uploading}
        hidden
      />
    </label>
  );
}
