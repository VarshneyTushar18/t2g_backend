-- Amazon Ads qualifying fields on generic leads table
-- Run once on local + production MySQL before deploying the updated lead.controller.js

ALTER TABLE `leads`
  ADD COLUMN `company` VARCHAR(255) DEFAULT NULL AFTER `phone`,
  ADD COLUMN `website` VARCHAR(500) DEFAULT NULL AFTER `company`,
  ADD COLUMN `marketplaces` VARCHAR(500) DEFAULT NULL AFTER `website`,
  ADD COLUMN `spend_band` VARCHAR(50) DEFAULT NULL AFTER `marketplaces`,
  ADD COLUMN `role` VARCHAR(100) DEFAULT NULL AFTER `spend_band`;
