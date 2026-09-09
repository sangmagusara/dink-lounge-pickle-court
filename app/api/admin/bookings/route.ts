import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";

const orderedTimes = ["6:00 AM","7:00 AM","8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM","7:00 PM","8:00 PM","9:00 PM","10:00 PM","11:00 PM"];
const validTimes = new Set(orderedTimes);

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function authorised() {
  const user = await getChatGPTUser();
  const configured = String((env as unknown as { ADMIN_EMAILS?: string }).ADMIN_EMAILS || "");
  const allowed = configured.split(",").map((value) => value.trim().toLowerCase());
  return Boolean(user && allowed.includes(user.email.toLowerCase()));
}

export async function GET() {
  if (!(await authorised())) return json({ error: "Not authorised." }, 403);
  const now = Date.now();
  await env.DB.prepare("DELETE FROM bookings WHERE status = ? AND expires_at <= ?").bind("pending_payment", now).run();
  const result = await env.DB.prepare("SELECT id, booking_date, court, start_time, customer_name, phone, email, players, paddle_rental, ball_rental, training_balls, amount, payment_reference, status, created_at FROM bookings ORDER BY booking_date, start_time, court").all();
  return json({ bookings: result.results });
}

export async function PATCH(request: Request) {
  if (!(await authorised())) return json({ error: "Not authorised." }, 403);
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id || "");
    const action = String(body.action || "");
    if (!id) return json({ error: "Booking reference is required." }, 400);

    if (action === "verify") {
      const result = await env.DB.prepare("UPDATE bookings SET status = ?, expires_at = ? WHERE id = ? AND status IN (?, ?)")
        .bind("paid", Date.now() + 365 * 24 * 60 * 60 * 1000, id, "payment_submitted", "pending_payment").run();
      if (!result.meta.changes) return json({ error: "Booking could not be verified." }, 409);
      return json({ ok: true });
    }

    if (action === "cancel") {
      const result = await env.DB.prepare("DELETE FROM bookings WHERE id = ?").bind(id).run();
      if (!result.meta.changes) return json({ error: "Booking was not found." }, 404);
      return json({ ok: true });
    }

    if (action === "reschedule") {
      const bookingDate = String(body.bookingDate || "");
      const court = String(body.court || "");
      const startTime = String(body.startTime || "");
      const todayInManila = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || bookingDate < todayInManila || !["Court 1", "Court 2"].includes(court) || !validTimes.has(startTime)) {
        return json({ error: "Please choose a valid date, court and time." }, 400);
      }
      const current=await env.DB.prepare("SELECT start_time FROM bookings WHERE id = ?").bind(id).first<{start_time:string}>();
      if(!current)return json({error:"Booking was not found."},404);
      const duration=String(current.start_time).split("|").length;
      const startIndex=orderedTimes.indexOf(startTime);
      const newTimes=orderedTimes.slice(startIndex,startIndex+duration);
      if(newTimes.length!==duration)return json({error:"This booking would extend past closing time."},400);
      const overlapChecks=newTimes.map(()=>"instr('|' || start_time || '|', '|' || ? || '|') > 0").join(" OR ");
      const conflict=await env.DB.prepare(`SELECT id FROM bookings WHERE booking_date = ? AND court = ? AND id != ? AND (${overlapChecks}) LIMIT 1`).bind(bookingDate,court,id,...newTimes).first();
      if(conflict)return json({error:"One or more hours in that time range are already reserved."},409);
      await env.DB.prepare("UPDATE bookings SET booking_date = ?, court = ?, start_time = ? WHERE id = ?").bind(bookingDate, court, newTimes.join("|"), id).run();
      return json({ ok: true });
    }

    return json({ error: "Unknown booking action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE") || message.includes("constraint")) return json({ error: "That court and time are already reserved." }, 409);
    console.error("Admin booking update failed", error);
    return json({ error: "The booking could not be updated." }, 500);
  }
}
