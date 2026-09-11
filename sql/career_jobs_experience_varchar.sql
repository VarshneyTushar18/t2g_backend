-- Store experience as text (e.g. "8+ Years") instead of integer
ALTER TABLE jobs MODIFY COLUMN experience VARCHAR(100) NOT NULL DEFAULT '0';
