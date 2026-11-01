CREATE TABLE `setup_suspensions` (
	`setup_id` integer NOT NULL,
	`component_id` integer NOT NULL,
	`air_pressure_psi` real,
	`spring_rate_lb_per_in` integer,
	`volume_spacers` integer,
	`sag_mm` real,
	`low_speed_rebound_clicks` integer,
	`high_speed_rebound_clicks` integer,
	`low_speed_compression_clicks` integer,
	`high_speed_compression_clicks` integer,
	PRIMARY KEY(`setup_id`, `component_id`),
	FOREIGN KEY (`setup_id`) REFERENCES `setups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "setup_suspensions_values_check" CHECK(("setup_suspensions"."air_pressure_psi" is null or "setup_suspensions"."air_pressure_psi" > 0) and ("setup_suspensions"."spring_rate_lb_per_in" is null or "setup_suspensions"."spring_rate_lb_per_in" > 0) and ("setup_suspensions"."volume_spacers" is null or "setup_suspensions"."volume_spacers" >= 0) and ("setup_suspensions"."sag_mm" is null or "setup_suspensions"."sag_mm" >= 0) and ("setup_suspensions"."low_speed_rebound_clicks" is null or "setup_suspensions"."low_speed_rebound_clicks" >= 0) and ("setup_suspensions"."high_speed_rebound_clicks" is null or "setup_suspensions"."high_speed_rebound_clicks" >= 0) and ("setup_suspensions"."low_speed_compression_clicks" is null or "setup_suspensions"."low_speed_compression_clicks" >= 0) and ("setup_suspensions"."high_speed_compression_clicks" is null or "setup_suspensions"."high_speed_compression_clicks" >= 0))
);
--> statement-breakpoint
CREATE INDEX `setup_suspensions_component_id_idx` ON `setup_suspensions` (`component_id`);--> statement-breakpoint
CREATE TABLE `setups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bike_id` integer NOT NULL,
	`set_on` text NOT NULL,
	`label` text,
	`tire_front_pressure_bar` real,
	`tire_rear_pressure_bar` real,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "setups_tire_pressure_check" CHECK(("setups"."tire_front_pressure_bar" is null or "setups"."tire_front_pressure_bar" > 0) and ("setups"."tire_rear_pressure_bar" is null or "setups"."tire_rear_pressure_bar" > 0))
);
--> statement-breakpoint
CREATE INDEX `setups_bike_id_set_on_idx` ON `setups` (`bike_id`,`set_on`);--> statement-breakpoint
CREATE TABLE `suspension_specs` (
	`component_id` integer PRIMARY KEY NOT NULL,
	`spring_type` text NOT NULL,
	`travel_mm` real,
	`low_speed_rebound_max_clicks` integer,
	`high_speed_rebound_max_clicks` integer,
	`low_speed_compression_max_clicks` integer,
	`high_speed_compression_max_clicks` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "suspension_specs_spring_type_check" CHECK("suspension_specs"."spring_type" in ('air', 'coil')),
	CONSTRAINT "suspension_specs_values_check" CHECK(("suspension_specs"."travel_mm" is null or "suspension_specs"."travel_mm" > 0) and ("suspension_specs"."low_speed_rebound_max_clicks" is null or "suspension_specs"."low_speed_rebound_max_clicks" > 0) and ("suspension_specs"."high_speed_rebound_max_clicks" is null or "suspension_specs"."high_speed_rebound_max_clicks" > 0) and ("suspension_specs"."low_speed_compression_max_clicks" is null or "suspension_specs"."low_speed_compression_max_clicks" > 0) and ("suspension_specs"."high_speed_compression_max_clicks" is null or "suspension_specs"."high_speed_compression_max_clicks" > 0))
);
