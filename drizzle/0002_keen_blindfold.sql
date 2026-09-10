CREATE TABLE `auto_paper_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`instrument` text NOT NULL,
	`config` text NOT NULL,
	`state` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`has_position` integer DEFAULT 0 NOT NULL,
	`close_requested` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`checked_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auto_user_instrument` ON `auto_paper_runs` (`user_id`,`instrument`);--> statement-breakpoint
CREATE INDEX `idx_auto_due` ON `auto_paper_runs` (`checked_at`);