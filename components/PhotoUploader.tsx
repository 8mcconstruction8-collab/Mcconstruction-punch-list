"use client";

import { ChangeEvent, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Camera, LoaderCircle } from "lucide-react";
import { storage } from "@/lib/firebase";

const MAX_FILES = 10;
const MAX_SIZE = 10 * 1024 * 1024;

type Props = {
  projectId: string;
  itemId: string;
  kind: "customer" | "contractor";
  onUploaded: (urls: string[]) => Promise<void>;
};

export default function PhotoUploader({
  projectId,
  itemId,
  kind,
  onUploaded
}: Props) {
  const [uploading, setUploading] = useState(false);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const allFiles = Array.from(event.target.files || []);
    if (allFiles.length === 0) return;

    const files = allFiles.slice(0, MAX_FILES);
    if (allFiles.length > MAX_FILES) {
      alert(`You can add up to ${MAX_FILES} photos at once — the first ${MAX_FILES} were selected.`);
    }

    if (files.some((file) => !file.type.startsWith("image/"))) {
      alert("Please select only images.");
      event.target.value = "";
      return;
    }

    if (files.some((file) => file.size > MAX_SIZE)) {
      alert("Each photo must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }

    try {
      setUploading(true);
      const urls = await Promise.all(
        files.map(async (file) => {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const fileRef = ref(
            storage,
            `projects/${projectId}/${itemId}/${kind}/${unique}-${safeName}`
          );
          await uploadBytes(fileRef, file, { contentType: file.type });
          return getDownloadURL(fileRef);
        })
      );
      await onUploaded(urls);
    } catch (error) {
      console.error(error);
      alert("Couldn't upload one or more photos.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <label className="btn btn-secondary row" style={{ display: "inline-flex" }}>
      {uploading ? <LoaderCircle size={17} /> : <Camera size={17} />}
      {uploading ? "Uploading..." : "Add photos"}
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
        disabled={uploading}
        hidden
      />
    </label>
  );
}
