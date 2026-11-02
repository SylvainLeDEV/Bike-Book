CREATE TABLE `procedure_run_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`procedure_step_id` integer,
	`sort_order` integer NOT NULL,
	`instruction` text NOT NULL,
	`note` text,
	`torque_nm` real,
	`done_at` integer,
	`comment` text,
	FOREIGN KEY (`run_id`) REFERENCES `procedure_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`procedure_step_id`) REFERENCES `procedure_steps`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "procedure_run_steps_torque_check" CHECK("procedure_run_steps"."torque_nm" is null or "procedure_run_steps"."torque_nm" > 0)
);
--> statement-breakpoint
CREATE INDEX `procedure_run_steps_run_id_idx` ON `procedure_run_steps` (`run_id`);--> statement-breakpoint
CREATE TABLE `procedure_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`bike_id` integer,
	`procedure_id` integer,
	`task_id` integer,
	`rule_id` integer,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`maintenance_event_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rule_id`) REFERENCES `maintenance_rules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`maintenance_event_id`) REFERENCES `maintenance_events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "procedure_runs_status_check" CHECK("procedure_runs"."status" in ('in_progress', 'done')),
	CONSTRAINT "procedure_runs_finished_check" CHECK(("procedure_runs"."status" = 'done') = ("procedure_runs"."finished_at" is not null) and ("procedure_runs"."status" = 'done' or "procedure_runs"."maintenance_event_id" is null)),
	CONSTRAINT "procedure_runs_context_check" CHECK(("procedure_runs"."bike_id" is not null or "procedure_runs"."task_id" is not null) and ("procedure_runs"."task_id" is null or "procedure_runs"."rule_id" is null))
);
--> statement-breakpoint
CREATE INDEX `procedure_runs_workspace_id_status_idx` ON `procedure_runs` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `procedure_runs_bike_id_idx` ON `procedure_runs` (`bike_id`);--> statement-breakpoint
CREATE INDEX `procedure_runs_task_id_idx` ON `procedure_runs` (`task_id`);--> statement-breakpoint
CREATE INDEX `procedure_runs_rule_id_idx` ON `procedure_runs` (`rule_id`);--> statement-breakpoint
CREATE INDEX `procedure_runs_maintenance_event_id_idx` ON `procedure_runs` (`maintenance_event_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bike_id` integer,
	`component_id` integer,
	`maintenance_event_id` integer,
	`ride_id` integer,
	`task_id` integer,
	`inventory_item_id` integer,
	`procedure_id` integer,
	`procedure_step_id` integer,
	`procedure_run_step_id` integer,
	`kind` text NOT NULL,
	`storage_path` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`width_px` integer,
	`height_px` integer,
	`taken_at` integer,
	`caption` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`maintenance_event_id`) REFERENCES `maintenance_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`procedure_step_id`) REFERENCES `procedure_steps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`procedure_run_step_id`) REFERENCES `procedure_run_steps`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "attachments_kind_check" CHECK("__new_attachments"."kind" in ('photo', 'invoice', 'manual', 'track', 'other')),
	CONSTRAINT "attachments_owner_check" CHECK((case when "__new_attachments"."bike_id" is null then 0 else 1 end) + (case when "__new_attachments"."component_id" is null then 0 else 1 end) + (case when "__new_attachments"."maintenance_event_id" is null then 0 else 1 end) + (case when "__new_attachments"."ride_id" is null then 0 else 1 end) + (case when "__new_attachments"."task_id" is null then 0 else 1 end) + (case when "__new_attachments"."inventory_item_id" is null then 0 else 1 end) + (case when "__new_attachments"."procedure_id" is null then 0 else 1 end) + (case when "__new_attachments"."procedure_step_id" is null then 0 else 1 end) + (case when "__new_attachments"."procedure_run_step_id" is null then 0 else 1 end) = 1),
	CONSTRAINT "attachments_photo_check" CHECK("__new_attachments"."kind" <> 'photo' or "__new_attachments"."mime_type" like 'image/%'),
	CONSTRAINT "attachments_size_check" CHECK("__new_attachments"."size_bytes" > 0 and ("__new_attachments"."width_px" is null or "__new_attachments"."width_px" > 0) and ("__new_attachments"."height_px" is null or "__new_attachments"."height_px" > 0))
);
--> statement-breakpoint
INSERT INTO `__new_attachments`("id", "bike_id", "component_id", "maintenance_event_id", "ride_id", "task_id", "inventory_item_id", "procedure_id", "procedure_step_id", "kind", "storage_path", "original_name", "mime_type", "size_bytes", "sha256", "width_px", "height_px", "taken_at", "caption", "created_at", "updated_at") SELECT "id", "bike_id", "component_id", "maintenance_event_id", "ride_id", "task_id", "inventory_item_id", "procedure_id", "procedure_step_id", "kind", "storage_path", "original_name", "mime_type", "size_bytes", "sha256", "width_px", "height_px", "taken_at", "caption", "created_at", "updated_at" FROM `attachments`;--> statement-breakpoint
DROP TABLE `attachments`;--> statement-breakpoint
ALTER TABLE `__new_attachments` RENAME TO `attachments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_storage_path_unique` ON `attachments` (`storage_path`);--> statement-breakpoint
CREATE INDEX `attachments_bike_id_idx` ON `attachments` (`bike_id`);--> statement-breakpoint
CREATE INDEX `attachments_component_id_idx` ON `attachments` (`component_id`);--> statement-breakpoint
CREATE INDEX `attachments_maintenance_event_id_idx` ON `attachments` (`maintenance_event_id`);--> statement-breakpoint
CREATE INDEX `attachments_ride_id_idx` ON `attachments` (`ride_id`);--> statement-breakpoint
CREATE INDEX `attachments_task_id_idx` ON `attachments` (`task_id`);--> statement-breakpoint
CREATE INDEX `attachments_inventory_item_id_idx` ON `attachments` (`inventory_item_id`);--> statement-breakpoint
CREATE INDEX `attachments_procedure_id_idx` ON `attachments` (`procedure_id`);--> statement-breakpoint
CREATE INDEX `attachments_procedure_step_id_idx` ON `attachments` (`procedure_step_id`);--> statement-breakpoint
CREATE INDEX `attachments_procedure_run_step_id_idx` ON `attachments` (`procedure_run_step_id`);--> statement-breakpoint
ALTER TABLE `maintenance_events` ADD `labor_time_s` integer;