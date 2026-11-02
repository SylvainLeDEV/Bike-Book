CREATE TABLE `procedure_bikes` (
	`procedure_id` integer NOT NULL,
	`bike_id` integer NOT NULL,
	PRIMARY KEY(`procedure_id`, `bike_id`),
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `procedure_bikes_bike_id_idx` ON `procedure_bikes` (`bike_id`);--> statement-breakpoint
CREATE TABLE `procedure_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`procedure_id` integer NOT NULL,
	`inventory_item_id` integer,
	`component_type_code` text,
	`label` text,
	`quantity` integer,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_type_code`) REFERENCES `component_types`(`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "procedure_items_target_check" CHECK((case when "procedure_items"."inventory_item_id" is null then 0 else 1 end) + (case when "procedure_items"."component_type_code" is null then 0 else 1 end) + (case when "procedure_items"."label" is null then 0 else 1 end) = 1),
	CONSTRAINT "procedure_items_quantity_check" CHECK("procedure_items"."quantity" is null or "procedure_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `procedure_items_procedure_id_idx` ON `procedure_items` (`procedure_id`);--> statement-breakpoint
CREATE INDEX `procedure_items_inventory_item_id_idx` ON `procedure_items` (`inventory_item_id`);--> statement-breakpoint
CREATE TABLE `procedure_resources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`procedure_id` integer NOT NULL,
	`kind` text NOT NULL,
	`url` text,
	`title` text,
	`duration_s` integer,
	`body` text,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "procedure_resources_kind_check" CHECK("procedure_resources"."kind" in ('video', 'link', 'note')),
	CONSTRAINT "procedure_resources_fields_check" CHECK(("procedure_resources"."kind" = 'note') = ("procedure_resources"."url" is null) and ("procedure_resources"."kind" = 'note') = ("procedure_resources"."body" is not null) and ("procedure_resources"."duration_s" is null or ("procedure_resources"."kind" = 'video' and "procedure_resources"."duration_s" > 0)))
);
--> statement-breakpoint
CREATE INDEX `procedure_resources_procedure_id_idx` ON `procedure_resources` (`procedure_id`);--> statement-breakpoint
CREATE TABLE `procedure_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`procedure_id` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`instruction` text NOT NULL,
	`note` text,
	`torque_nm` real,
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "procedure_steps_torque_check" CHECK("procedure_steps"."torque_nm" is null or "procedure_steps"."torque_nm" > 0)
);
--> statement-breakpoint
CREATE INDEX `procedure_steps_procedure_id_idx` ON `procedure_steps` (`procedure_id`);--> statement-breakpoint
CREATE TABLE `procedures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`component_type_code` text,
	`model_hint` text,
	`all_bikes` integer DEFAULT false NOT NULL,
	`estimated_duration_s` integer,
	`difficulty` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_type_code`) REFERENCES `component_types`(`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "procedures_difficulty_check" CHECK("procedures"."difficulty" in ('easy', 'medium', 'hard')),
	CONSTRAINT "procedures_duration_check" CHECK("procedures"."estimated_duration_s" is null or "procedures"."estimated_duration_s" > 0)
);
--> statement-breakpoint
CREATE INDEX `procedures_workspace_id_idx` ON `procedures` (`workspace_id`);--> statement-breakpoint
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
	CONSTRAINT "attachments_kind_check" CHECK("__new_attachments"."kind" in ('photo', 'invoice', 'manual', 'track', 'other')),
	CONSTRAINT "attachments_owner_check" CHECK((case when "__new_attachments"."bike_id" is null then 0 else 1 end) + (case when "__new_attachments"."component_id" is null then 0 else 1 end) + (case when "__new_attachments"."maintenance_event_id" is null then 0 else 1 end) + (case when "__new_attachments"."ride_id" is null then 0 else 1 end) + (case when "__new_attachments"."task_id" is null then 0 else 1 end) + (case when "__new_attachments"."inventory_item_id" is null then 0 else 1 end) + (case when "__new_attachments"."procedure_id" is null then 0 else 1 end) + (case when "__new_attachments"."procedure_step_id" is null then 0 else 1 end) = 1),
	CONSTRAINT "attachments_photo_check" CHECK("__new_attachments"."kind" <> 'photo' or "__new_attachments"."mime_type" like 'image/%'),
	CONSTRAINT "attachments_size_check" CHECK("__new_attachments"."size_bytes" > 0 and ("__new_attachments"."width_px" is null or "__new_attachments"."width_px" > 0) and ("__new_attachments"."height_px" is null or "__new_attachments"."height_px" > 0))
);
--> statement-breakpoint
INSERT INTO `__new_attachments`("id", "bike_id", "component_id", "maintenance_event_id", "ride_id", "task_id", "inventory_item_id", "kind", "storage_path", "original_name", "mime_type", "size_bytes", "sha256", "width_px", "height_px", "taken_at", "caption", "created_at", "updated_at") SELECT "id", "bike_id", "component_id", "maintenance_event_id", "ride_id", "task_id", "inventory_item_id", "kind", "storage_path", "original_name", "mime_type", "size_bytes", "sha256", "width_px", "height_px", "taken_at", "caption", "created_at", "updated_at" FROM `attachments`;--> statement-breakpoint
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
ALTER TABLE `maintenance_rules` ADD `procedure_id` integer REFERENCES procedures(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `tasks` ADD `procedure_id` integer REFERENCES procedures(id) ON DELETE set null;