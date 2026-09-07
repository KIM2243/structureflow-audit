CREATE TABLE `watchlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`market` text NOT NULL,
	`ticker` text NOT NULL,
	`exchange` text,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_watchlist_user_market_ticker` ON `watchlist_items` (`user_id`,`market`,`ticker`);--> statement-breakpoint
CREATE INDEX `idx_watchlist_user_market_position` ON `watchlist_items` (`user_id`,`market`,`position`);
