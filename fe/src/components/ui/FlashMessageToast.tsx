"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import {
  FLASH_MESSAGE_EVENT,
  consumeFlashMessage,
  type FlashMessage,
} from "../../lib/flash-message";

const DEFAULT_FLASH_DURATION_MS = 5000;

// Hiển thị giao diện flash tin nhắn toast.
export function FlashMessageToast() {
  const [flashMessage, setFlashMessage] = useState<FlashMessage | null>(null);

  const showFlashMessage = useCallback((nextFlashMessage: FlashMessage) => {
    setFlashMessage(nextFlashMessage);

    return window.setTimeout(
      () => setFlashMessage(null),
      nextFlashMessage.durationMs ?? DEFAULT_FLASH_DURATION_MS,
    );
  }, []);

  useEffect(() => {
    const nextFlashMessage = consumeFlashMessage();
    let timeoutId: number | undefined;

    if (nextFlashMessage) {
      timeoutId = showFlashMessage(nextFlashMessage);
    }

    // Xử lý sự kiện flash tin nhắn.
    function handleFlashMessage(event: Event) {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = showFlashMessage((event as CustomEvent<FlashMessage>).detail);
    }

    window.addEventListener(FLASH_MESSAGE_EVENT, handleFlashMessage);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      window.removeEventListener(FLASH_MESSAGE_EVENT, handleFlashMessage);
    };
  }, [showFlashMessage]);

  if (!flashMessage) return null;

  const Icon = flashMessage.type === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div
      className={`flash-toast flash-toast--${flashMessage.type}`}
      role={flashMessage.type === "error" ? "alert" : "status"}
      aria-live={flashMessage.type === "error" ? "assertive" : "polite"}
    >
      <Icon size={18} />
      <span>{flashMessage.message}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => setFlashMessage(null)}
      >
        <X size={16} />
      </button>
    </div>
  );
}
