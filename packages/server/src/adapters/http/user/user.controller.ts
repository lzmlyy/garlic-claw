import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../../auth/http-auth';
import { UpdateUserDto, UpdateUserRoleDto } from '../../../user/dto/user.dto';
import { UserService } from '../../../user/user.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Roles('super_admin', 'admin')
  findAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.userService.findAll(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.userService.findById(userId);
  }

  @Get(':id')
  @Roles('super_admin', 'admin')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findById(id);
  }

  @Patch(':id')
  @Roles('super_admin', 'admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.update(id, dto);
  }

  @Patch(':id/role')
  @Roles('super_admin')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.userService.updateRole(id, dto);
  }

  @Delete(':id')
  @Roles('super_admin')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.delete(id);
  }
}
