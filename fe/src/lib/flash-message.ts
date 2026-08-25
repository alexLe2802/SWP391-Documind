export type FlashMessage = {
  type: "success" | "error";
  message: string;
  durationMs?: number;
};

const FLASH_MESSAGE_KEY = "ai-study-hub:flash-message";
export const FLASH_MESSAGE_EVENT = "ai-study-hub:flash-message";

// Cập nhật flash tin nhắn.
export function setFlashMessage(message: FlashMessage) {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(FLASH_MESSAGE_KEY, JSON.stringify(message));
  window.dispatchEvent(
    new CustomEvent<FlashMessage>(FLASH_MESSAGE_EVENT, { detail: message }),
  );
}

// Thực hiện chức năng consume flash tin nhắn.
export function consumeFlashMessage(): FlashMessage | null {
  if (typeof window === "undefined") return null;

  const storedMessage = window.sessionStorage.getItem(FLASH_MESSAGE_KEY);
  if (!storedMessage) return null;

  window.sessionStorage.removeItem(FLASH_MESSAGE_KEY);

  try {
    const parsedMessage = JSON.parse(storedMessage) as Partial<FlashMessage>;
    if (
      (parsedMessage.type === "success" || parsedMessage.type === "error") &&
      typeof parsedMessage.message === "string"
    ) {
      return {
        type: parsedMessage.type,
        message: parsedMessage.message,
        durationMs:
          typeof parsedMessage.durationMs === "number"
            ? parsedMessage.durationMs
            : undefined,
      };
    }
  } catch {
    return null;
  }

  return null;
}
