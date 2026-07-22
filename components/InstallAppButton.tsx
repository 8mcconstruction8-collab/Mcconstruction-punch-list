"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    setIsIOS(/iphone|ipad|ipod/i.test(window.navigator.userAgent));
    setReady(true);

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  if (!ready || isStandalone) return null;

  async function handleClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }
    alert(
      "Look for \"Install app\" or \"Add to Home Screen\" in your browser's menu."
    );
  }

  return (
    <>
      <button className="btn btn-secondary row no-print" onClick={handleClick}>
        <Download size={16} />
        Install app
      </button>

      {showIOSInstructions && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "flex-end",
            zIndex: 100
          }}
          onClick={() => setShowIOSInstructions(false)}
        >
          <div
            className="card stack"
            style={{ width: "100%", margin: 0, borderRadius: "20px 20px 0 0" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between">
              <strong>Install this app</strong>
              <button
                onClick={() => setShowIOSInstructions(false)}
                style={{ border: "none", background: "none", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>
            <p className="small" style={{ margin: 0 }}>
              1. Tap the <Share size={14} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
              Share button in Safari's toolbar.
            </p>
            <p className="small" style={{ margin: 0 }}>
              2. Scroll down and tap <strong>"Add to Home Screen"</strong>.
            </p>
            <p className="small" style={{ margin: 0 }}>
              3. Tap <strong>"Add"</strong> in the top corner.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => setShowIOSInstructions(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
