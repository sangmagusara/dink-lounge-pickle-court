import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const bookings = sqliteTable("bookings", {
  id: text("id").primaryKey(),
  bookingDate: text("booking_date").notNull(),
  court: text("court").notNull(),
  startTime: text("start_time").notNull(),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  players: integer("players").notNull(),
  paddleRental: integer("paddle_rental", { mode: "boolean" }).notNull().default(false),
  ballRental: integer("ball_rental", { mode: "boolean" }).notNull().default(false),
  trainingBalls: integer("training_balls", { mode: "boolean" }).notNull().default(false),
  amount: integer("amount").notNull(),
  paymentReference: text("payment_reference"),
  status: text("status").notNull().default("pending_payment"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [
  uniqueIndex("idx_bookings_slot").on(table.bookingDate, table.court, table.startTime),
  index("idx_bookings_date_status").on(table.bookingDate, table.status),
]);
