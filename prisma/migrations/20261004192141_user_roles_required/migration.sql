-- Every user must have at least one role. Prisma can't express NOT NULL on list fields, and a
-- manual edit in Prisma Studio once set roles to NULL — this CHECK makes the database refuse it.
ALTER TABLE "User"
  ADD CONSTRAINT "User_roles_required"
  CHECK ("roles" IS NOT NULL AND cardinality("roles") >= 1);
