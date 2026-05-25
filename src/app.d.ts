import type { components } from '$lib/api/backend';

declare global {
  namespace App {
    interface Locals {
      user: components['schemas']['User'] | null;
      mustChangePassword: boolean;
    }
  }
}

export {};
