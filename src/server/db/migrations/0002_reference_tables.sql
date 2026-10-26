CREATE TABLE `component_types` (
	`code` text PRIMARY KEY NOT NULL,
	`component_group` text NOT NULL,
	`has_position` integer NOT NULL,
	`single_slot` integer NOT NULL,
	CONSTRAINT "component_types_component_group_check" CHECK("component_types"."component_group" in ('suspension', 'drivetrain', 'brakes', 'wheels', 'cockpit', 'frame', 'electric', 'other'))
);
--> statement-breakpoint
CREATE TABLE `rule_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer,
	`code` text,
	`component_type_code` text,
	`title` text NOT NULL,
	`interval_distance_m` integer,
	`interval_wear_s` integer,
	`interval_days` integer,
	`source` text NOT NULL,
	`evidence_level` text NOT NULL,
	`source_url` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_type_code`) REFERENCES `component_types`(`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rule_templates_source_check" CHECK("rule_templates"."source" in ('manufacturer', 'common_practice', 'personal')),
	CONSTRAINT "rule_templates_evidence_level_check" CHECK("rule_templates"."evidence_level" in ('verified', 'secondary', 'unverified', 'estimate')),
	CONSTRAINT "rule_templates_interval_check" CHECK(("rule_templates"."interval_distance_m" is not null or "rule_templates"."interval_wear_s" is not null or "rule_templates"."interval_days" is not null) and ("rule_templates"."interval_distance_m" is null or "rule_templates"."interval_distance_m" > 0) and ("rule_templates"."interval_wear_s" is null or "rule_templates"."interval_wear_s" > 0) and ("rule_templates"."interval_days" is null or "rule_templates"."interval_days" > 0)),
	CONSTRAINT "rule_templates_code_check" CHECK(("rule_templates"."workspace_id" is null and "rule_templates"."code" is not null) or ("rule_templates"."workspace_id" is not null and "rule_templates"."code" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_templates_code_unique` ON `rule_templates` (`code`);--> statement-breakpoint
CREATE INDEX `rule_templates_workspace_id_idx` ON `rule_templates` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `rule_templates_component_type_code_idx` ON `rule_templates` (`component_type_code`);