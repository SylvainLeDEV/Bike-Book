-- Reference data (phase 1, feature 2): built-in component types and rule templates.
-- Present in every installation, production included; the demo seed does not create them.
-- Codes and values are defined in docs/03-data-model.md; French labels live in the UI.
-- Instants: 2026-10-26T00:00:00Z as epoch milliseconds.
INSERT INTO `component_types` (`code`, `component_group`, `has_position`, `single_slot`) VALUES
	('fork', 'suspension', false, true),
	('rear_shock', 'suspension', false, true),
	('chain', 'drivetrain', false, true),
	('cassette', 'drivetrain', false, true),
	('chainring', 'drivetrain', false, true),
	('crankset', 'drivetrain', false, true),
	('bottom_bracket', 'drivetrain', false, true),
	('rear_derailleur', 'drivetrain', false, true),
	('shifter', 'drivetrain', false, true),
	('pedals', 'drivetrain', false, true),
	('brake', 'brakes', true, true),
	('brake_pads', 'brakes', true, true),
	('rotor', 'brakes', true, true),
	('wheel', 'wheels', true, true),
	('tire', 'wheels', true, true),
	('handlebar', 'cockpit', false, true),
	('stem', 'cockpit', false, true),
	('grips', 'cockpit', false, true),
	('saddle', 'cockpit', false, true),
	('dropper_post', 'cockpit', false, true),
	('frame', 'frame', false, true),
	('headset', 'frame', false, true),
	('motor', 'electric', false, true),
	('battery', 'electric', false, true),
	('display', 'electric', false, true),
	('other', 'other', false, false);
--> statement-breakpoint
INSERT INTO `rule_templates` (`workspace_id`, `code`, `component_type_code`, `title`, `interval_distance_m`, `interval_wear_s`, `interval_days`, `source`, `evidence_level`, `source_url`, `notes`, `created_at`, `updated_at`) VALUES
	(NULL, 'rockshox_fork_lower_leg_service', 'fork', 'Entretien des bas de fourreaux (RockShox)', NULL, 180000, NULL, 'manufacturer', 'secondary', NULL, 'RockShox : 50 h de pilotage pour les bas de fourreaux, révision complète à 100 ou 200 h selon l''année du modèle. Lu dans un résumé, la page du constructeur bloquant l''accès direct : vérifie dans le manuel de ta fourche.', 1792972800000, 1792972800000),
	(NULL, 'rockshox_rear_shock_air_can_service', 'rear_shock', 'Entretien de la chambre à air (RockShox)', NULL, 180000, NULL, 'manufacturer', 'secondary', NULL, 'RockShox : 50 h de pilotage pour la chambre à air. Lu dans un résumé, la page du constructeur bloquant l''accès direct : vérifie dans le manuel de ton amortisseur.', 1792972800000, 1792972800000),
	(NULL, 'fox_fork_full_service', 'fork', 'Révision complète (Fox)', NULL, 450000, 365, 'manufacturer', 'unverified', NULL, '125 h ou une fois par an, au premier atteint : chiffre cité par des revendeurs, d''autres donnent 100 h. Vérifie dans le manuel de ta fourche.', 1792972800000, 1792972800000),
	(NULL, 'fox_rear_shock_full_service', 'rear_shock', 'Révision complète (Fox)', NULL, 450000, 365, 'manufacturer', 'unverified', NULL, '125 h ou une fois par an, au premier atteint : chiffre cité par des revendeurs, d''autres donnent 100 h. Vérifie dans le manuel de ton amortisseur.', 1792972800000, 1792972800000),
	(NULL, 'chain_wear_check', 'chain', 'Contrôle d''usure de la chaîne', 500000, NULL, NULL, 'common_practice', 'estimate', NULL, 'Estimation d''usage courant : contrôle avec un indicateur d''usure, plus souvent par temps humide ou boueux.', 1792972800000, 1792972800000),
	(NULL, 'brake_bleed', 'brake', 'Purge des freins', NULL, NULL, 365, 'common_practice', 'estimate', NULL, 'Freins hydrauliques. Estimation d''usage courant : plus tôt si le levier devient spongieux.', 1792972800000, 1792972800000),
	(NULL, 'tubeless_sealant_top_up', 'tire', 'Ajout de liquide préventif', NULL, NULL, 90, 'common_practice', 'estimate', NULL, 'Pneus tubeless. Estimation d''usage courant : le liquide sèche plus vite par temps chaud.', 1792972800000, 1792972800000),
	(NULL, 'bike_general_check', NULL, 'Contrôle général du vélo', NULL, NULL, 365, 'common_practice', 'estimate', NULL, 'Estimation d''usage courant : serrages, jeux, roulements, câbles et gaines.', 1792972800000, 1792972800000);
