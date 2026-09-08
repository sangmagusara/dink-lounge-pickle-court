import { chatGPTSignOutPath, getChatGPTUser } from "../chatgpt-auth";
import AdminDashboard from "./admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return <main className="admin-access"><div><p>Access restricted</p><h1>This account is not authorised.</h1><span>Sign in using an approved Dink Lounge management email.</span><a href={chatGPTSignOutPath("/admin")} target="_top">Sign out and try another account</a></div></main>;
  }
  return <AdminDashboard email={user.email}/>;
}
