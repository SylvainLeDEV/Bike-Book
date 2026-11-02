PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_maintenance_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`action` text NOT NULL,
	`component_id` integer,
	`new_component_id` integer,
	`rule_id` integer,
	`description` text,
	`cost_cents` integer,
	`measurement_value` real,
	`measurement_unit` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `maintenance_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`new_component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `maintenance_rules`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "maintenance_items_action_check" CHECK("__new_maintenance_items"."action" in ('replaced', 'serviced', 'repaired', 'inspected', 'adjusted', 'cleaned', 'lubricated', 'bled', 'trued', 'other')),
	CONSTRAINT "maintenance_items_measurement_unit_check" CHECK("__new_maintenance_items"."measurement_unit" in ('percent', 'mm')),
	CONSTRAINT "maintenance_items_replaced_check" CHECK(("__new_maintenance_items"."action" = 'replaced' and "__new_maintenance_items"."component_id" is not null and "__new_maintenance_items"."new_component_id" is not null) or ("__new_maintenance_items"."action" <> 'replaced' and "__new_maintenance_items"."new_component_id" is null)),
	CONSTRAINT "maintenance_items_measurement_check" CHECK(("__new_maintenance_items"."measurement_value" is null) = ("__new_maintenance_items"."measurement_unit" is null)),
	CONSTRAINT "maintenance_items_cost_check" CHECK("__new_maintenance_items"."cost_cents" is null or "__new_maintenance_items"."cost_cents" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_maintenance_items`("id", "event_id", "action", "component_id", "new_component_id", "rule_id", "description", "cost_cents", "measurement_value", "measurement_unit", "created_at") SELECT "id", "event_id", "action", "component_id", "new_component_id", "rule_id", "description", "cost_cents", "measurement_value", "measurement_unit", "created_at" FROM `maintenance_items`;--> statement-breakpoint
DROP TABLE `maintenance_items`;--> statement-breakpoint
ALTER TABLE `__new_maintenance_items` RENAME TO `maintenance_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `maintenance_items_event_id_idx` ON `maintenance_items` (`event_id`);--> statement-breakpoint
CREATE INDEX `maintenance_items_component_id_idx` ON `maintenance_items` (`component_id`);--> statement-breakpoint
CREATE INDEX `maintenance_items_new_component_id_idx` ON `maintenance_items` (`new_component_id`);