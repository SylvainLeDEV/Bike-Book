CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`bike_id` integer,
	`component_type_code` text,
	`position` text,
	`title` text NOT NULL,
	`due_on` text,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`done_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_type_code`) REFERENCES `component_types`(`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tasks_status_check" CHECK("tasks"."status" in ('open', 'done', 'cancelled')),
	CONSTRAINT "tasks_priority_check" CHECK("tasks"."priority" in ('low', 'normal', 'high')),
	CONSTRAINT "tasks_position_check" CHECK("tasks"."position" in ('front', 'rear', 'none')),
	CONSTRAINT "tasks_done_check" CHECK(("tasks"."status" = 'done') = ("tasks"."done_at" is not null))
);
--> statement-breakpoint
CREATE INDEX `tasks_workspace_id_status_idx` ON `tasks` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_bike_id_idx` ON `tasks` (`bike_id`);