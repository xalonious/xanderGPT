import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../core/password"; 

const prisma = new PrismaClient();

async function main() {
  const email = "testuser@gmail.com";
  const plainPassword = "test123!";

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    console.log("Test user already exists.");
    return;
  }

  const passwordHash = await hashPassword(plainPassword);

  await prisma.user.create({
    data: {
      email,
      passwordHash,
    },
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });