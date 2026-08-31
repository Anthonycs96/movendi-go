import { redirect } from "next/navigation";
import { getSessionContext } from "@/shared/lib/api-client";
import { ForcedPasswordForm } from "./ForcedPasswordForm";

export default async function ForcedPasswordPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!context.session.mustChangePassword) redirect("/");
  return <ForcedPasswordForm userName={context.session.userName} />;
}
