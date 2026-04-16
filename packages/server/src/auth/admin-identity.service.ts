import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type BootstrapAdminRole = 'super_admin' | 'admin';

export interface BootstrapAdminConfig {
  username: string;
  email: string;
  password: string;
  role: BootstrapAdminRole;
}

export interface AdminIdentityCandidate {
  username: string;
  email?: string | null;
  role: string;
}

@Injectable()
export class AdminIdentityService {
  constructor(private readonly configService: ConfigService) {}

  readBootstrapAdminConfig(): BootstrapAdminConfig | null {
    const username = this.readTrimmedConfig('BOOTSTRAP_ADMIN_USERNAME');
    const password = this.readTrimmedConfig('BOOTSTRAP_ADMIN_PASSWORD');
    if (!username || !password) {
      return null;
    }

    return {
      username,
      email: this.readTrimmedConfig('BOOTSTRAP_ADMIN_EMAIL') ?? this.createBootstrapAdminEmail(username),
      password,
      role: this.readBootstrapAdminRole(this.readTrimmedConfig('BOOTSTRAP_ADMIN_ROLE')),
    };
  }

  resolveRole(candidate: AdminIdentityCandidate): string {
    if (
      this.matchesAny(
        candidate,
        'SUPER_ADMIN_USERNAMES',
        'SUPER_ADMIN_EMAILS',
      )
    ) {
      return 'super_admin';
    }

    if (this.matchesAny(candidate, 'ADMIN_USERNAMES', 'ADMIN_EMAILS')) {
      return 'admin';
    }

    const bootstrapAdmin = this.readBootstrapAdminConfig();
    if (bootstrapAdmin && this.matchesBootstrapAdmin(candidate, bootstrapAdmin)) {
      return bootstrapAdmin.role;
    }

    return candidate.role;
  }

  private matchesAny(
    candidate: AdminIdentityCandidate,
    usernamesEnv: string,
    emailsEnv: string,
  ): boolean {
    const usernames = this.readIdentifiers(usernamesEnv);
    if (usernames.has(normalizeAdminIdentifier(candidate.username))) {
      return true;
    }

    const email = candidate.email
      ? normalizeAdminIdentifier(candidate.email)
      : null;
    if (!email) {
      return false;
    }

    const emails = this.readIdentifiers(emailsEnv);
    return emails.has(email);
  }

  private readIdentifiers(key: string): Set<string> {
    const raw = this.configService.get<string>(key) ?? '';
    return new Set(
      raw
        .split(/[,\r\n]+/)
        .map(normalizeAdminIdentifier)
        .filter((item) => item.length > 0),
    );
  }

  private matchesBootstrapAdmin(
    candidate: AdminIdentityCandidate,
    bootstrapAdmin: { username: string; email: string },
  ): boolean {
    if (
      normalizeAdminIdentifier(candidate.username)
      === normalizeAdminIdentifier(bootstrapAdmin.username)
    ) {
      return true;
    }

    const email = candidate.email
      ? normalizeAdminIdentifier(candidate.email)
      : null;
    return email === normalizeAdminIdentifier(bootstrapAdmin.email);
  }

  private createBootstrapAdminEmail(username: string): string {
    const localPart = normalizeAdminIdentifier(username)
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `${localPart || 'admin'}@bootstrap.local`;
  }

  private readBootstrapAdminRole(raw: string | null): BootstrapAdminRole {
    return raw === 'admin' ? 'admin' : 'super_admin';
  }

  private readTrimmedConfig(key: string): string | null {
    const value = this.configService.get<string>(key)?.trim();
    return value ? value : null;
  }
}

function normalizeAdminIdentifier(value: string): string {
  return value.trim().toLowerCase();
}
