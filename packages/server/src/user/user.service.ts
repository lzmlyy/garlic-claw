import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminIdentityService } from '../auth/admin-identity.service';
import { getPrismaClient } from '../infrastructure/prisma/prisma-client';
import { UpdateUserDto, UpdateUserRoleDto } from './dto/user.dto';

type UserRecord = {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class UserService {
  constructor(private readonly adminIdentity: AdminIdentityService) {}

  async findAll(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [users, total] = await Promise.all([
      getPrismaClient().user.findMany({
        skip,
        take: pageSize,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      getPrismaClient().user.count(),
    ]);

    return {
      data: users.map((user: UserRecord) => serializeUser(user, this.adminIdentity)),
      total,
      page,
      pageSize,
    };
  }

  async findById(id: string) {
    const user = await getPrismaClient().user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return serializeUser(user, this.adminIdentity);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);
    const user = await getPrismaClient().user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return serializeUser(user, this.adminIdentity);
  }

  async updateRole(id: string, dto: UpdateUserRoleDto) {
    await this.findById(id);
    const user = await getPrismaClient().user.update({
      where: { id },
      data: { role: dto.role },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return serializeUser(user, this.adminIdentity);
  }

  async delete(id: string) {
    await this.findById(id);
    await getPrismaClient().user.delete({
      where: { id },
    });
    return { message: 'User deleted' };
  }
}

function serializeUser(user: UserRecord, adminIdentity: AdminIdentityService) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: adminIdentity.resolveRole(user),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
