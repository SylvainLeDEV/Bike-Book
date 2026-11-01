PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_setup_suspensions` (
	`setup_id` integer NOT NULL,
	`component_id` integer NOT NULL,
	`air_pressure_psi` real,
	`spring_rate_lb_per_in` integer,
	`volume_spacers` integer,
	`sag_mm` real,
	`sag_target_percent` real,
	`low_speed_rebound_clicks` integer,
	`high_speed_rebound_clicks` integer,
	`low_speed_compression_clicks` integer,
	`high_speed_compression_clicks` integer,
	PRIMARY KEY(`setup_id`, `component_id`),
	FOREIGN KEY (`setup_id`) REFERENCES `setups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "setup_suspensions_values_check" CHECK(("__new_setup_suspensions"."air_pressure_psi" is null or "__new_setup_suspensions"."air_pressure_psi" > 0) and ("__new_setup_suspensions"."spring_rate_lb_per_in" is null or "__new_setup_suspensions"."spring_rate_lb_per_in" > 0) and ("__new_setup_suspensions"."volume_spacers" is null or "__new_setup_suspensions"."volume_spacers" >= 0) and ("__new_setup_suspensions"."sag_mm" is null or "__new_setup_suspensions"."sag_mm" >= 0) and ("__new_setup_suspensions"."sag_target_percent" is null or ("__new_setup_suspensions"."sag_target_percent" > 0 and "__new_setup_suspensions"."sag_target_percent" <= 100)) and ("__new_setup_suspensions"."low_speed_rebound_clicks" is null or "__new_setup_suspensions"."low_speed_rebound_clicks" >= 0) and ("__new_setup_suspensions"."high_speed_rebound_clicks" is null or "__new_setup_suspensions"."high_speed_rebound_clicks" >= 0) and ("__new_setup_suspensions"."low_speed_compression_clicks" is null or "__new_setup_suspensions"."low_speed_compression_clicks" >= 0) and ("__new_setup_suspensions"."high_speed_compression_clicks" is null or "__new_setup_suspensions"."high_speed_compression_clicks" >= 0))
);
--> statement-breakpoint
INSERT INTO `__new_setup_suspensions`("setup_id", "component_id", "air_pressure_psi", "spring_rate_lb_per_in", "volume_spacers", "sag_mm", "low_speed_rebound_clicks", "high_speed_rebound_clicks", "low_speed_compression_clicks", "high_speed_compression_clicks") SELECT "setup_id", "component_id", "air_pressure_psi", "spring_rate_lb_per_in", "volume_spacers", "sag_mm", "low_speed_rebound_clicks", "high_speed_rebound_clicks", "low_speed_compression_clicks", "high_speed_compression_clicks" FROM `setup_suspensions`;--> statement-breakpoint
DROP TABLE `setup_suspensions`;--> statement-breakpoint
ALTER TABLE `__new_setup_suspensions` RENAME TO `setup_suspensions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `setup_suspensions_component_id_idx` ON `setup_suspensions` (`component_id`);--> statement-breakpoint
CREATE TABLE `__new_suspension_specs` (
	`component_id` integer PRIMARY KEY NOT NULL,
	`spring_type` text NOT NULL,
	`travel_mm` real,
	`wheel_travel_mm` real,
	`low_speed_rebound_max_clicks` integer,
	`high_speed_rebound_max_clicks` integer,
	`low_speed_compression_max_clicks` integer,
	`high_speed_compression_max_clicks` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "suspension_specs_spring_type_check" CHECK("__new_suspension_specs"."spring_type" in ('air', 'coil')),
	CONSTRAINT "suspension_specs_values_check" CHECK(("__new_suspension_specs"."travel_mm" is null or "__new_suspension_specs"."travel_mm" > 0) and ("__new_suspension_specs"."wheel_travel_mm" is null or "__new_suspension_specs"."wheel_travel_mm" > 0) and ("__new_suspension_specs"."low_speed_rebound_max_clicks" is null or "__new_suspension_specs"."low_speed_rebound_max_clicks" > 0) and ("__new_suspension_specs"."high_speed_rebound_max_clicks" is null or "__new_suspension_specs"."high_speed_rebound_max_clicks" > 0) and ("__new_suspension_specs"."low_speed_compression_max_clicks" is null or "__new_suspension_specs"."low_speed_compression_max_clicks" > 0) and ("__new_suspension_specs"."high_speed_compression_max_clicks" is null or "__new_suspension_specs"."high_speed_compression_max_clicks" > 0))
);
--> statement-breakpoint
INSERT INTO `__new_suspension_specs`("component_id", "spring_type", "travel_mm", "low_speed_rebound_max_clicks", "high_speed_rebound_max_clicks", "low_speed_compression_max_clicks", "high_speed_compression_max_clicks", "created_at", "updated_at") SELECT "component_id", "spring_type", "travel_mm", "low_speed_rebound_max_clicks", "high_speed_rebound_max_clicks", "low_speed_compression_max_clicks", "high_speed_compression_max_clicks", "created_at", "updated_at" FROM `suspension_specs`;--> statement-breakpoint
DROP TABLE `suspension_specs`;--> statement-breakpoint
ALTER TABLE `__new_suspension_specs` RENAME TO `suspension_specs`;