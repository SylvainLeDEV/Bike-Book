CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bike_id` integer,
	`component_id` integer,
	`maintenance_event_id` integer,
	`ride_id` integer,
	`task_id` integer,
	`inventory_item_id` integer,
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
	CONSTRAINT "attachments_kind_check" CHECK("attachments"."kind" in ('photo', 'invoice', 'manual', 'track', 'other')),
	CONSTRAINT "attachments_owner_check" CHECK((case when "attachments"."bike_id" is null then 0 else 1 end) + (case when "attachments"."component_id" is null then 0 else 1 end) + (case when "attachments"."maintenance_event_id" is null then 0 else 1 end) + (case when "attachments"."ride_id" is null then 0 else 1 end) + (case when "attachments"."task_id" is null then 0 else 1 end) + (case when "attachments"."inventory_item_id" is null then 0 else 1 end) = 1),
	CONSTRAINT "attachments_photo_check" CHECK("attachments"."kind" <> 'photo' or "attachments"."mime_type" like 'image/%'),
	CONSTRAINT "attachments_size_check" CHECK("attachments"."size_bytes" > 0 and ("attachments"."width_px" is null or "attachments"."width_px" > 0) and ("attachments"."height_px" is null or "attachments"."height_px" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_storage_path_unique` ON `attachments` (`storage_path`);--> statement-breakpoint
CREATE INDEX `attachments_bike_id_idx` ON `attachments` (`bike_id`);--> statement-breakpoint
CREATE INDEX `attachments_component_id_idx` ON `attachments` (`component_id`);--> statement-breakpoint
CREATE INDEX `attachments_maintenance_event_id_idx` ON `attachments` (`maintenance_event_id`);--> statement-breakpoint
CREATE INDEX `attachments_ride_id_idx` ON `attachments` (`ride_id`);--> statement-breakpoint
CREATE INDEX `attachments_task_id_idx` ON `attachments` (`task_id`);--> statement-breakpoint
CREATE INDEX `attachments_inventory_item_id_idx` ON `attachments` (`inventory_item_id`);--> statement-breakpoint
ALTER TABLE `bikes` ADD `cover_attachment_id` integer REFERENCES attachments(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `photo_attachment_id` integer REFERENCES attachments(id) ON DELETE set null;