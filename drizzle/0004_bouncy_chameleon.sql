CREATE TABLE `entry_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`run_id` text NOT NULL,
	`decision_at` integer NOT NULL,
	`decision` text NOT NULL,
	`draft` text NOT NULL,
	`replay_key` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_entry_review_identity` ON `entry_reviews` (`user_id`,`run_id`,`decision_at`);--> statement-breakpoint
CREATE INDEX `idx_entry_review_updated` ON `entry_reviews` (`user_id`,`updated_at`);