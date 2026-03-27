-- Update legacy status values to new enum values.
UPDATE "Invoice"
SET "status" = 'SENT'
WHERE "status" = 'UNPAID';
