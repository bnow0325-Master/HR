import { redirect } from "next/navigation";
import ApprovalQueue from "./ApprovalQueue";
import { isAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  return <ApprovalQueue />;
}
