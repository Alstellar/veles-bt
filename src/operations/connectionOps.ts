import { ConnectionService } from '../services/ConnectionService';
import { VelesService } from '../services/VelesService';
import { OpErrorCode } from '../mcp-bridge/errors';

export async function listTabs() {
  const tabs = await VelesService.findTabs();
  return {
    tabs: tabs.map((tab) => ({
      id: tab.id ?? null,
      url: tab.url ?? null,
      title: tab.title ?? null,
      active: Boolean(tab.active)
    }))
  };
}

export async function getConnection() {
  const result = await ConnectionService.getConnection({ force: true });
  if (!result.success) {
    const code =
      result.reason === 'no_tab'
        ? OpErrorCode.NO_VELES_TAB
        : result.reason === 'no_token'
          ? OpErrorCode.NO_TOKEN
          : result.reason === 'unauthorized'
            ? OpErrorCode.UNAUTHORIZED
            : OpErrorCode.INTERNAL;

    return {
      ready: false,
      reason: result.reason,
      code,
      message: ConnectionService.reasonToMessage(result.reason)
    };
  }

  const { connection, fromCache } = result;
  return {
    ready: true,
    fromCache,
    tabId: connection.tabId,
    origin: connection.origin,
    user: {
      id: connection.user.id,
      email: connection.user.email,
      roles: connection.user.roles ?? []
    },
    checkedAt: connection.checkedAt
  };
}
