CREATE TABLE `maintenance_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bike_id` integer NOT NULL,
	`component_type_code` text,
	`position` text,
	`template_id` integer,
	`title` text NOT NULL,
	`interval_distance_m` integer,
	`interval_wear_s` integer,
	`interval_days` integer,
	`warn_ratio` real DEFAULT 0.9 NOT NULL,
	`reset_on_replacement` integer DEFAULT true NOT NULL,
	`counter_start_at` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`snooze_ends_on` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_type_code`) REFERENCES `component_types`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `rule_templates`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "maintenance_rules_position_check" CHECK("maintenance_rules"."position" in ('front', 'rear', 'none')),
	CONSTRAINT "maintenance_rules_interval_check" CHECK(("maintenance_rules"."interval_distance_m" is not null or "maintenance_rules"."interval_wear_s" is not null or "maintenance_rules"."interval_days" is not null) and ("maintenance_rules"."interval_distance_m" is null or "maintenance_rules"."interval_distance_m" > 0) and ("maintenance_rules"."interval_wear_s" is null or "maintenance_rules"."interval_wear_s" > 0) and ("maintenance_rules"."interval_days" is null or "maintenance_rules"."interval_days" > 0)),
	CONSTRAINT "maintenance_rules_warn_ratio_check" CHECK("maintenance_rules"."warn_ratio" > 0 and "maintenance_rules"."warn_ratio" < 1),
	CONSTRAINT "maintenance_rules_slot_check" CHECK("maintenance_rules"."component_type_code" is not null or "maintenance_rules"."position" is null)
);
--> statement-breakpoint
CREATE INDEX `maintenance_rules_bike_id_idx` ON `maintenance_rules` (`bike_id`);--> statement-breakpoint
ALTER TABLE `maintenance_items` ADD `rule_id` integer REFERENCES maintenance_rules(id) ON DELETE set null;