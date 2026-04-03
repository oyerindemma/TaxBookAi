import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEED_USERS = [
  {
    email: "test@taxbookai.com",
    fullName: "TaxBook Test User",
    password: "Test@12345",
    role: Role.TEST,
  },
  {
    email: "demo@taxbookai.com",
    fullName: "TaxBook Demo User",
    password: "Test@12345",
    role: Role.TEST,
  },
  {
    email: "admin@taxbookai.com",
    fullName: "TaxBook Admin User",
    password: "Admin@12345",
    role: Role.ADMIN,
  },
] as const;

async function main() {
  const passwordHashes = await Promise.all(
    SEED_USERS.map(async (user) => [user.email, await bcrypt.hash(user.password, 12)] as const)
  );

  const passwordHashByEmail = new Map(passwordHashes);

  for (const user of SEED_USERS) {
    const hashedPassword = passwordHashByEmail.get(user.email);

    if (!hashedPassword) {
      throw new Error(`Missing hashed password for ${user.email}`);
    }

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        fullName: user.fullName,
        password: hashedPassword,
        role: user.role,
      },
      create: {
        email: user.email,
        fullName: user.fullName,
        password: hashedPassword,
        role: user.role,
      },
    });
  }

  console.log(
    `Seeded ${SEED_USERS.length} users: ${SEED_USERS.map((user) => user.email).join(", ")}`
  );
}

main()
  .catch((error) => {
    console.error("Failed to seed test/demo users.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
