import { redirect } from "next/navigation";
import { ROUTES } from "../../../lib/routes";

export default function AskDocumentPage() {
  redirect(`${ROUTES.aiChat}?scope=document`);
}
