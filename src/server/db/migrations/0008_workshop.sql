CREATE TABLE `inventory_item_bikes` (
	`item_id` integer NOT NULL,
	`bike_id` integer NOT NULL,
	PRIMARY KEY(`item_id`, `bike_id`),
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inventory_item_bikes_bike_id_idx` ON `inventory_item_bikes` (`bike_id`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`reference` text,
	`category` text NOT NULL,
	`component_type_code` text,
	`all_bikes` integer DEFAULT false NOT NULL,
	`unit` text,
	`low_stock_threshold` integer,
	`container_label` text,
	`restock_status` text DEFAULT 'none' NOT NULL,
	`restock_quantity` integer,
	`restock_changed_on` text,
	`location` text,
	`notes` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_type_code`) REFERENCES `component_types`(`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inventory_items_kind_check" CHECK("inventory_items"."kind" in ('part', 'product', 'tool')),
	CONSTRAINT "inventory_items_category_check" CHECK("inventory_items"."category" in ('suspension', 'drivetrain', 'brakes', 'wheels', 'cockpit', 'frame', 'electric', 'other', 'care')),
	CONSTRAINT "inventory_items_unit_check" CHECK("inventory_items"."unit" in ('piece', 'pair', 'set')),
	CONSTRAINT "inventory_items_restock_status_check" CHECK("inventory_items"."restock_status" in ('none', 'to_order', 'ordered')),
	CONSTRAINT "inventory_items_unit_kind_check" CHECK(("inventory_items"."kind" = 'part') = ("inventory_items"."unit" is not null)),
	CONSTRAINT "inventory_items_restock_check" CHECK(("inventory_items"."restock_status" = 'none' and "inventory_items"."restock_quantity" is null) or ("inventory_items"."restock_status" <> 'none' and ("inventory_items"."restock_quantity" is null or "inventory_items"."restock_quantity" > 0))),
	CONSTRAINT "inventory_items_threshold_check" CHECK("inventory_items"."low_stock_threshold" is null or "inventory_items"."low_stock_threshold" >= 0)
);
--> statement-breakpoint
CREATE INDEX `inventory_items_workspace_id_idx` ON `inventory_items` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`kind` text NOT NULL,
	`quantity_delta` integer NOT NULL,
	`level_after` text,
	`unit_cost_cents` integer,
	`purchase_link_id` integer,
	`maintenance_item_id` integer,
	`created_by` text,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`purchase_link_id`) REFERENCES `purchase_links`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`maintenance_item_id`) REFERENCES `maintenance_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "inventory_movements_kind_check" CHECK("inventory_movements"."kind" in ('initial', 'purchase', 'use', 'adjustment')),
	CONSTRAINT "inventory_movements_level_after_check" CHECK("inventory_movements"."level_after" in ('full', 'started', 'low', 'empty')),
	CONSTRAINT "inventory_movements_delta_check" CHECK(("inventory_movements"."kind" <> 'purchase' or "inventory_movements"."quantity_delta" > 0) and ("inventory_movements"."kind" <> 'use' or "inventory_movements"."quantity_delta" <= 0) and ("inventory_movements"."kind" <> 'initial' or "inventory_movements"."quantity_delta" >= 0)),
	CONSTRAINT "inventory_movements_cost_check" CHECK("inventory_movements"."unit_cost_cents" is null or "inventory_movements"."unit_cost_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `inventory_movements_item_id_idx` ON `inventory_movements` (`item_id`);--> statement-breakpoint
CREATE INDEX `inventory_movements_maintenance_item_id_idx` ON `inventory_movements` (`maintenance_item_id`);--> statement-breakpoint
CREATE TABLE `purchase_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`shop_id` integer,
	`url` text,
	`price_cents` integer,
	`price_noted_on` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "purchase_links_target_check" CHECK("purchase_links"."shop_id" is not null or "purchase_links"."url" is not null),
	CONSTRAINT "purchase_links_price_check" CHECK("purchase_links"."price_cents" is null or "purchase_links"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `purchase_links_item_id_idx` ON `purchase_links` (`item_id`);--> statement-breakpoint
ALTER TABLE `components` ADD `inventory_item_id` integer REFERENCES inventory_items(id) ON DELETE set null;