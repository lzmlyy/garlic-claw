/**
 * Prisma Seed Script
 * 创建默认管理员账号
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('开始创建默认账号...');

  // 检查是否已存在 admin 账号
  const existingAdmin = await prisma.user.findUnique({
    where: { username: 'admin' },
  });

  if (existingAdmin) {
    console.log('管理员账号已存在，跳过创建');
    return;
  }

  // 创建默认管理员账号
  const passwordHash = await bcrypt.hash('admin123', 12);

  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@garlic-claw.local',
      passwordHash,
      role: 'admin',
    },
  });

  console.log(`✅ 默认管理员账号创建成功:`);
  console.log(`   用户名: admin`);
  console.log(`   密码: admin123`);
  console.log(`   邮箱: admin@garlic-claw.local`);
  console.log(`   角色: admin`);

  // 同时创建一个普通用户账号
  const existingUser = await prisma.user.findUnique({
    where: { username: 'user' },
  });

  if (!existingUser) {
    const userPasswordHash = await bcrypt.hash('user123', 12);

    await prisma.user.create({
      data: {
        username: 'user',
        email: 'user@garlic-claw.local',
        passwordHash: userPasswordHash,
        role: 'user',
      },
    });

    console.log(`✅ 默认普通用户账号创建成功:`);
    console.log(`   用户名: user`);
    console.log(`   密码: user123`);
    console.log(`   邮箱: user@garlic-claw.local`);
    console.log(`   角色: user`);
  }
}

main()
  .catch((e) => {
    console.error('创建默认账号失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
