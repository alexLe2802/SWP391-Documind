import { redirect } from "next/navigation";
import { ROUTES } from "../../../lib/routes";

// Hiển thị giao diện ask tài liệu page.
export default function AskDocumentPage() {
  redirect(`${ROUTES.aiChat}?scope=document`);
}
