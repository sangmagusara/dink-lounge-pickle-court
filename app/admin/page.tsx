import { env } from "cloudflare:workers";
import { chatGPTSignOutPath, getAccessTokenDiagnostic, getChatGPTUser } from "../chatgpt-auth";
import AdminDashboard from "./admin-dashboard";

export const dynamic = "force-dynamic";

function isAdminEmail(email: string): boolean {
  const configured = String((env as unknown as { ADMIN_EMAILS?: string }).ADMIN_EMAILS || "");
  return configured.split(",").map((value) => value.trim().toLowerCase()).includes(email.toLowerCase());
}

export default async function AdminPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return <main className="admin-access"><div><p>Access restricted</p><h1>Cloudflare login could not be verified.</h1><span>Error code: {await getAccessTokenDiagnostic()}</span><a href={chatGPTSignOutPath("/admin")} target="_top">Sign out and try again</a></div></main>;
  }
  if (!isAdminEmail(user.email)) {
    return <main className="admin-access"><div><p>Access restricted</p><h1>This email is not on the admin list.</h1><span>Error code: ADMIN-LIST</span><a href={chatGPTSignOutPath("/admin")} target="_top">Sign out and try another account</a></div></main>;
  }
  return <AdminDashboard email={user.email}/>;
}
