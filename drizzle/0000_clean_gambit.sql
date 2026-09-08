CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_date` text NOT NULL,
	`court` text NOT NULL,
	`start_time` text NOT NULL,
	`customer_name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`players` integer NOT NULL,
	`paddle_rental` integer DEFAULT false NOT NULL,
	`ball_rental` integer DEFAULT false NOT NULL,
	`training_balls` integer DEFAULT false NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending_payment' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_slot` ON `bookings` (`booking_date`,`court`,`start_time`);--> statement-breakpoint
CREATE INDEX `idx_bookings_date_status` ON `bookings` (`booking_date`,`status`);--> statement-breakpoint
PRAGMA optimize;
