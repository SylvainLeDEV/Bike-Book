CREATE TABLE `bikes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`name` text NOT NULL,
	`discipline` text NOT NULL,
	`is_electric` integer DEFAULT false NOT NULL,
	`brand` text,
	`model` text,
	`model_year` integer,
	`frame_size` text,
	`wheel_size` text,
	`color` text,
	`frame_serial` text,
	`weight_g` integer,
	`purchased_on` text,
	`purchase_price_cents` integer,
	`purchase_shop_id` integer,
	`bought_used` integer DEFAULT false NOT NULL,
	`initial_distance_m` integer DEFAULT 0 NOT NULL,
	`initial_wear_s` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`status_changed_on` text,
	`sale_price_cents` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`purchase_shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "bikes_discipline_check" CHECK("bikes"."discipline" in ('road', 'gravel', 'xc', 'trail', 'enduro', 'dh', 'dirt', 'city', 'other')),
	CONSTRAINT "bikes_wheel_size_check" CHECK("bikes"."wheel_size" in ('29', '27.5', '26', 'mullet', '700c', '650b', 'other')),
	CONSTRAINT "bikes_status_check" CHECK("bikes"."status" in ('active', 'stored', 'sold', 'stolen', 'retired')),
	CONSTRAINT "bikes_sale_price_check" CHECK("bikes"."sale_price_cents" is null or ("bikes"."status" = 'sold' and "bikes"."sale_price_cents" >= 0)),
	CONSTRAINT "bikes_amounts_check" CHECK(("bikes"."purchase_price_cents" is null or "bikes"."purchase_price_cents" >= 0) and ("bikes"."weight_g" is null or "bikes"."weight_g" > 0) and "bikes"."initial_distance_m" >= 0 and "bikes"."initial_wear_s" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bikes_workspace_id_name_unique` ON `bikes` (`workspace_id`,`name`);--> statement-breakpoint
CREATE INDEX `bikes_purchase_shop_id_idx` ON `bikes` (`purchase_shop_id`);--> statement-breakpoint
CREATE TABLE `shops` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`city` text,
	`phone` text,
	`website` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "shops_kind_check" CHECK("shops"."kind" in ('physical', 'online'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shops_workspace_id_name_unique` ON `shops` (`workspace_id`,`name`);