/**
 * Production registers admin-user providers through AdminModule. This alias keeps
 * the reconstructed import path valid without maintaining a second DI graph.
 */
export { AdminModule as AdminUsersModule } from '../admin.module';
