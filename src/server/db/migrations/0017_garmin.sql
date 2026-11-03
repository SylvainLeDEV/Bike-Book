CREATE TABLE `activity_type_bikes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`provider` text NOT NULL,
	`activity_type` text NOT NULL,
	`bike_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "activity_type_bikes_provider_check" CHECK("activity_type_bikes"."provider" in ('garmin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_type_bikes_workspace_provider_type_unique` ON `activity_type_bikes` (`workspace_id`,`provider`,`activity_type`);--> statement-breakpoint
CREATE TABLE `external_activities` (
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
	CONSTRAINT "external_activities_provider_check" CHECK("external_activities"."provider" in ('garmin')),
	CONSTRAINT "external_activities_status_check" CHECK("external_activities"."status" in ('new', 'assigned', 'ignored')),
	CONSTRAINT "external_activities_pending_reason_check" CHECK("external_activities"."pending_reason" in ('no_bike_for_type', 'bike_not_ridden', 'possible_duplicate')),
	CONSTRAINT "external_activities_pending_check" CHECK(("external_activities"."status" = 'new') = ("external_activities"."pending_reason" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_activities_workspace_provider_external_id_unique` ON `external_activities` (`workspace_id`,`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `external_activities_workspace_id_started_at_idx` ON `external_activities` (`workspace_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `external_activities_ride_id_idx` ON `external_activities` (`ride_id`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` integer NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`key_ciphertext` text NOT NULL,
	`key_hint` text NOT NULL,
	`key_expires_on` text NOT NULL,
	`key_saved_at` integer NOT NULL,
	`import_from` text NOT NULL,
	`last_sync_at` integer,
	`last_success_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "integrations_provider_check" CHECK("integrations"."provider" in ('garmin')),
	CONSTRAINT "integrations_status_check" CHECK("integrations"."status" in ('active', 'key_rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_user_workspace_provider_unique` ON `integrations` (`user_id`,`workspace_id`,`provider`);