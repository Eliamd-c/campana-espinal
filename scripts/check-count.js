const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getCount() {
  const count = await prisma.contacto.count();
  console.log(`TOTAL_CONTACTOS:${count}`);
  await prisma.$disconnect();
}

getCount();
