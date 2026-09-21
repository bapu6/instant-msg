import { getHostIp } from './api';

export interface XmppAccount {
  username: string;
  password: string;
  jid: string;
}

export const XMPP_CONFIG = {
  domain: 'localhost',
  port: 5280,
  path: '/ws',
  get serviceUrl(): string {
    return `ws://${getHostIp()}:${this.port}${this.path}`;
  },
  testAccounts: {
    alice: {
      username: 'alice',
      password: 'secret123',
      jid: 'alice@localhost',
    },
    bob: {
      username: 'bob',
      password: 'secret123',
      jid: 'bob@localhost',
    },
    admin: {
      username: 'admin',
      password: 'adminpass',
      jid: 'admin@localhost',
    },
  } as Record<string, XmppAccount>,
};

export default XMPP_CONFIG;
