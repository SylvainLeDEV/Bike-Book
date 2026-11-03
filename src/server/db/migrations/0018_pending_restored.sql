PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_external_activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`activity_type` text NOT NULL,
	`name` text,
	`location` text,
	`distance_m` integer,
	`duration_s` integer,
	`moving_time_s` integer,
	`elapsed_time_s` integer,
	`elevation_gain_m` integer,
	`elevation_loss_m` integer,
	`summary_json` text NOT NULL,
	`status` text NOT NULL,
	`pending_reason` text,
	`suggested_bike_id` integer,
	`ride_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`suggested_bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "external_activities_provider_check" CHECK("__new_external_activities"."provider" in ('garmin')),
	CONSTRAINT "external_activities_status_check" CHECK("__new_external_activities"."status" in ('new', 'assigned', 'ignored')),
	CONSTRAINT "external_activities_pending_reason_check" CHECK("__new_external_activities"."pending_reason" in ('no_bike_for_type', 'bike_not_ridden', 'possible_duplicate', 'restored')),
	CONSTRAINT "external_activities_pending_check" CHECK(("__new_external_activities"."status" = 'new') = ("__new_external_activities"."pending_reason" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_external_activities`("id", "workspace_id", "provider", "external_id", "started_at", "activity_type", "name", "location", "distance_m", "duration_s", "moving_time_s", "elapsed_time_s", "elevation_gain_m", "elevation_loss_m", "summary_json", "status", "pending_reason", "suggested_bike_id", "ride_id", "created_at", "updated_at") SELECT "id", "workspace_id", "provider", "external_id", "started_at", "activity_type", "name", "location", "distance_m", "duration_s", "moving_time_s", "elapsed_time_s", "elevation_gain_m", "elevation_loss_m", "summary_json", "status", "pending_reason", "suggested_bike_id", "ride_id", "created_at", "updated_at" FROM `external_activities`;--> statement-breakpoint
DROP TABLE `external_activities`;--> statement-breakpoint
ALTER TABLE `__new_external_activities` RENAME TO `external_activities`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `external_activities_workspace_provider_external_id_unique` ON `external_activities` (`workspace_id`,`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `external_activities_workspace_id_started_at_idx` ON `external_activities` (`workspace_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `external_activities_ride_id_idx` ON `external_activities` (`ride_id`);