import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: 'admin@chatbot.local' },
  });

  if (existing) {
    console.log('Admin user already exists, skipping seed.');
    return;
  }

  const hashedPassword = await bcrypt.hash('Admin@123456', 10);

  const user = await prisma.user.create({
    data: {
      email: 'admin@chatbot.local',
      name: 'Administrator',
      role: 'ADMIN',
      password: hashedPassword,
    },
  });

  const kb = await prisma.knowledgeBase.create({
    data: {
      name: 'Default Knowledge Base',
      description: 'Knowledge base mặc định',
    },
  });

  console.log('Seeded admin user:', user.email);
  console.log('Seeded knowledge base:', kb.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
