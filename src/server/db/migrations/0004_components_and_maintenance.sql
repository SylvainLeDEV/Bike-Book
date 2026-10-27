CREATE TABLE `components` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bike_id` integer NOT NULL,
	`type_code` text NOT NULL,
	`position` text NOT NULL,
	`brand` text,
	`model` text,
	`reference` text,
	`specs` text,
	`origin` text NOT NULL,
	`replaces_component_id` integer,
	`installed_at` integer NOT NULL,
	`initial_distance_m` integer DEFAULT 0 NOT NULL,
	`initial_wear_s` integer DEFAULT 0 NOT NULL,
	`removed_at` integer,
	`removal_reason` text,
	`removal_note` text,
	`purchased_on` text,
	`purchase_price_cents` integer,
	`shop_id` integer,
	`warranty_ends_on` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_code`) REFERENCES `component_types`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`replaces_component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "components_position_check" CHECK("components"."position" in ('front', 'rear', 'none')),
	CONSTRAINT "components_origin_check" CHECK("components"."origin" in ('stock', 'replacement', 'upgrade')),
	CONSTRAINT "components_removal_reason_check" CHECK("components"."removal_reason" in ('worn', 'broken', 'crash', 'upgrade', 'sold_with_bike', 'other')),
	CONSTRAINT "components_removal_check" CHECK(("components"."removed_at" is null and "components"."removal_reason" is null and "components"."removal_note" is null) or ("components"."removed_at" is not null and "components"."removal_reason" is not null and "components"."removed_at" >= "components"."installed_at")),
	CONSTRAINT "components_origin_chain_check" CHECK("components"."replaces_component_id" is null or "components"."origin" <> 'stock'),
	CONSTRAINT "components_amounts_check" CHECK(("components"."purchase_price_cents" is null or "components"."purchase_price_cents" >= 0) and "components"."initial_distance_m" >= 0 and "components"."initial_wear_s" >= 0)
);
--> statement-breakpoint
CREATE INDEX `components_bike_id_idx` ON `components` (`bike_id`);--> statement-breakpoint
CREATE INDEX `components_replaces_component_id_idx` ON `components` (`replaces_component_id`);--> statement-breakpoint
CREATE TABLE `maintenance_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bike_id` integer NOT NULL,
	`performed_on` text NOT NULL,
	`title` text NOT NULL,
	`performed_by` text NOT NULL,
	`shop_id` integer,
	`created_by` text,
	`total_cost_cents` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "maintenance_events_performed_by_check" CHECK("maintenance_events"."performed_by" in ('self', 'shop')),
	CONSTRAINT "maintenance_events_shop_check" CHECK("maintenance_events"."performed_by" = 'shop' or "maintenance_events"."shop_id" is null),
	CONSTRAINT "maintenance_events_total_check" CHECK("maintenance_events"."total_cost_cents" is null or "maintenance_events"."total_cost_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `maintenance_events_bike_id_idx` ON `maintenance_events` (`bike_id`);--> statement-breakpoint
CREATE TABLE `maintenance_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`action` text NOT NULL,
	`component_id` integer,
	`new_component_id` integer,
	`description` text,
	`cost_cents` integer,
	`measurement_value` real,
	`measurement_unit` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `maintenance_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`new_component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "maintenance_items_action_check" CHECK("maintenance_items"."action" in ('replaced', 'serviced', 'inspected', 'adjusted', 'cleaned', 'lubricated', 'bled', 'trued', 'other')),
	CONSTRAINT "maintenance_items_measurement_unit_check" CHECK("maintenance_items"."measurement_unit" in ('percent', 'mm')),
	CONSTRAINT "maintenance_items_replaced_check" CHECK(("maintenance_items"."action" = 'replaced' and "maintenance_items"."component_id" is not null and "maintenance_items"."new_component_id" is not null) or ("maintenance_items"."action" <> 'replaced' and "maintenance_items"."new_component_id" is null)),
	CONSTRAINT "maintenance_items_measurement_check" CHECK(("maintenance_items"."measurement_value" is null) = ("maintenance_items"."measurement_unit" is null)),
	CONSTRAINT "maintenance_items_cost_check" CHECK("maintenance_items"."cost_cents" is null or "maintenance_items"."cost_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `maintenance_items_event_id_idx` ON `maintenance_items` (`event_id`);--> statement-breakpoint
CREATE INDEX `maintenance_items_component_id_idx` ON `maintenance_items` (`component_id`);--> statement-breakpoint
CREATE INDEX `maintenance_items_new_component_id_idx` ON `maintenance_items` (`new_component_id`);