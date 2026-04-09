import { Injectable, NotFoundException } from "@nestjs/common";
import { AdminIdentityService } from "../auth/admin-identity.service";
import { Cacheable } from "../cache/cacheable.decorator";
import { CacheService } from "../cache/cache.service";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateUserDto, UpdateUserRoleDto } from "./dto/user.dto";

type UserListRecord = {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

const USER_CONFIG_CACHE_PREFIX = "user:config";

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private readonly adminIdentity: AdminIdentityService,
    private readonly cacheService: CacheService,
  ) {}

  async findAll(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
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
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.count(),
    ]);

    return {
      data: users.map((user: UserListRecord) => this.withRuntimeRole(user)),
      total,
      page,
      pageSize,
    };
  }

  @Cacheable(60, USER_CONFIG_CACHE_PREFIX)
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
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
      throw new NotFoundException("User not found");
    }

    return this.withRuntimeRole(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);
    const user = await this.prisma.user.update({
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

    await this.cacheService.delete(USER_CONFIG_CACHE_PREFIX, id);
    return this.withRuntimeRole(user);
  }

  async updateRole(id: string, dto: UpdateUserRoleDto) {
    await this.findById(id);
    const user = await this.prisma.user.update({
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

    await this.cacheService.delete(USER_CONFIG_CACHE_PREFIX, id);
    return this.withRuntimeRole(user);
  }

  async delete(id: string) {
    await this.findById(id);
    await this.prisma.user.delete({ where: { id } });
    await this.cacheService.delete(USER_CONFIG_CACHE_PREFIX, id);
    return { message: "User deleted" };
  }

  /**
   * 为 API 输出叠加环境变量管理员角色。
   * @param user 数据库用户
   * @returns 带最终角色的用户
   */
  private withRuntimeRole<
    T extends { username: string; email: string; role: string },
  >(user: T): T {
    return {
      ...user,
      role: this.adminIdentity.resolveRole(user),
    };
  }
}
