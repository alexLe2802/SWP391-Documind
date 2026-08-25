import { redirect } from "next/navigation";
import { ROUTES } from "../../../lib/routes";

// Hiển thị giao diện ask library page.
export default function AskLibraryPage() {
  redirect(ROUTES.aiChat);
}
