import { env } from "cloudflare:workers";

const launchDate = "2026-09-09";
const validTimes = new Set(["6:00 AM","7:00 AM","8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM","7:00 PM","8:00 PM","9:00 PM","10:00 PM","11:00 PM"]);

function slotHasEndedInManila(bookingDate: string, startTime: string, now: number) {
  const manila = new Date(now + 8 * 60 * 60 * 1000);
  const today = manila.toISOString().slice(0, 10);
  if (bookingDate < today) return true;
  if (bookingDate > today) return false;
  const match = startTime.match(/^(\d+):(\d+) (AM|PM)$/);
  if (!match) return false;
  let hour = Number(match[1]) % 12;
  if (match[3] === "PM") hour += 12;
  const slotEnd = hour * 60 + Number(match[2]) + 60;
  return manila.getUTCHours() * 60 + manila.getUTCMinutes() >= slotEnd;
}

function timesRemaining(startTime: string) {
  const ordered=[...validTimes];
  const index=ordered.indexOf(startTime);
  return index < 0 ? 0 : ordered.length-index;
}

function selectedTimes(startTime:string,durationHours:number){const ordered=[...validTimes];const index=ordered.indexOf(startTime);return ordered.slice(index,index+durationHours)}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || launchDate;
    const to = url.searchParams.get("to") || from;
    const now = Date.now();
    await env.DB.prepare("DELETE FROM bookings WHERE status = ? AND expires_at <= ?").bind("pending_payment", now).run();
    const result = await env.DB.prepare("SELECT booking_date, court, start_time, status FROM bookings WHERE status != 'cancelled' AND booking_date BETWEEN ? AND ? ORDER BY booking_date, court, start_time").bind(from, to).all();
    const bookings=(result.results as Array<{booking_date:string;court:string;start_time:string;status:string}>).flatMap((item)=>String(item.start_time).split("|").map((start_time)=>({...item,start_time})));
    return json({ bookings });
  } catch (error) {
    console.error("Availability load failed", error);
    return json({ error: "Availability is temporarily unavailable." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const bookingDate = String(body.bookingDate || "");
    const court = String(body.court || "");
    const startTime = String(body.startTime || "");
    const durationHours = Number(body.durationHours || 1);
    const customerName = String(body.customerName || "").trim().slice(0, 100);
    const phone = String(body.phone || "").trim().slice(0, 30);
    const email = String(body.email || "").trim().slice(0, 150);
    const players = Number(body.players || 2);
    const paddleRental = Boolean(body.paddleRental);
    const ballRental = Boolean(body.ballRental);
    const trainingBalls = Boolean(body.trainingBalls);

    const todayInManila = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const earliestDate = todayInManila > launchDate ? todayInManila : launchDate;
    if (bookingDate < earliestDate || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || !["Court 1", "Court 2"].includes(court) || !validTimes.has(startTime) || !Number.isInteger(durationHours) || durationHours < 1 || durationHours > timesRemaining(startTime) || !customerName || !phone || !email.includes("@") || !Number.isInteger(players) || players < 1 || players > 20) {
      return json({ error: "Please check your booking details and try again." }, 400);
    }

    const now = Date.now();
    if (slotHasEndedInManila(bookingDate, startTime, now)) {
      return json({ error: "That time slot has already passed. Please choose another time." }, 409);
    }
    const expiresAt = now + 15 * 60 * 1000;
    const id = crypto.randomUUID();
    const startTimes = selectedTimes(startTime, durationHours);
    const storedStartTime = startTimes.join("|");
    const amount = 200 * durationHours + (paddleRental ? 100 : 0) + (ballRental ? 20 : 0) + (trainingBalls ? 150 : 0);
    const removeExpired = env.DB.prepare("DELETE FROM bookings WHERE status = ? AND expires_at <= ?").bind("pending_payment", now);
    const overlapChecks = startTimes.map(()=>"instr('|' || start_time || '|', '|' || ? || '|') > 0").join(" OR ");
    const insert = env.DB.prepare(`INSERT INTO bookings (id, booking_date, court, start_time, customer_name, phone, email, players, paddle_rental, ball_rental, training_balls, amount, status, created_at, expires_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE booking_date = ? AND court = ? AND status != 'cancelled' AND (${overlapChecks}))`).bind(id, bookingDate, court, storedStartTime, customerName, phone, email, players, paddleRental ? 1 : 0, ballRental ? 1 : 0, trainingBalls ? 1 : 0, amount, "pending_payment", now, expiresAt, bookingDate, court, ...startTimes);
    const results = await env.DB.batch([removeExpired, insert]);
    if (!results[1].meta.changes) return json({ error: "One or more of those hours have just been booked. Please choose another time." }, 409);
    return json({ booking: { id, bookingDate, court, startTime: storedStartTime, startTimes, durationHours, amount, status: "pending_payment", expiresAt } }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE") || message.includes("constraint")) return json({ error: "That slot has just been booked. Please choose another time." }, 409);
    console.error("Booking save failed", error);
    return json({ error: "We couldn’t save your booking. Please try again." }, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id || "");
    if (!id) return json({ error: "Booking reference is required." }, 400);
    const now = Date.now();
    const result = await env.DB.prepare("UPDATE bookings SET status = ?, expires_at = ? WHERE id = ? AND status = ? AND expires_at > ?").bind("payment_submitted", now + 90 * 24 * 60 * 60 * 1000, id, "pending_payment", now).run();
    if (!result.meta.changes) return json({ error: "This payment window has expired. Please book the slot again." }, 409);
    return json({ status: "payment_submitted" });
  } catch (error) {
    console.error("Payment submission update failed", error);
    return json({ error: "We couldn’t update your payment status. Please try again." }, 500);
  }
}
