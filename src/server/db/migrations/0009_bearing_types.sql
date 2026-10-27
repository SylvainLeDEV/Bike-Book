-- Reference data: two bearing types (D-71). The bottom bracket and the headset already exist.
-- Additive only (D-69): existing parts keep their type. Codes are defined in docs/03-data-model.md;
-- French labels live in the UI.
INSERT INTO `component_types` (`code`, `component_group`, `has_position`, `single_slot`) VALUES
	('hub_bearings', 'wheels', true, true),
	('frame_bearings', 'frame', false, true);
