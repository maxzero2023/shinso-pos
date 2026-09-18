import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { StaffClient } from "./StaffClient";

export default async function StaffPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "kitchen") redirect("/kitchen");
  return <StaffClient name={session.name} />;
}
