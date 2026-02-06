-- Run this in Supabase SQL Editor to add the UNIQUE constraint
-- https://supabase.com/dashboard/project/bijtealkyvehtwmwqfsk/editor

-- First, delete any duplicate commands if they exist
DELETE FROM commands a USING commands b
WHERE a.id > b.id AND a.command = b.command;

-- Add UNIQUE constraint on command column
ALTER TABLE commands ADD CONSTRAINT commands_command_unique UNIQUE (command);

-- Verify the constraint was added
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'commands';
