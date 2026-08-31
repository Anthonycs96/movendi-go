import { redirect } from "next/navigation";
import { PageContainer } from "@/shared/components/ui";
import { getSessionContext } from "@/shared/lib/api-client";
import { ProfileWorkspace } from "./ProfileWorkspace";

export default async function ProfilePage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  return <PageContainer><ProfileWorkspace session={context.session} /></PageContainer>;
}
