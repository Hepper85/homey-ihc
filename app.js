const Homey = require('homey');
const { Client, id } = require('./lib/ihc');

module.exports = class IhcApp extends Homey.App {
  async onInit() {
    this.clients = new Map();
    this.groups = new Map();
    for (const action of ['pulse', 'bool', 'int', 'float']) {
      this.homey.flow.getActionCard(action).registerRunListener(async args => {
        const c = this.client(args.device.getStoreValue('origin'));
        const n = id(args.resource);
        if (action === 'pulse') await c.pulse(n);
        else await c.write(n, action, action === 'bool' ? args.value === 'true' : args.value);
        return true;
      });
    }
  }
  remember(c) {
    this.homey.settings.set(`controller:${c.origin}`, { user: c.username, pass: c.password });
    this.clients.set(c.origin, c);
  }
  client(origin) {
    if (!this.clients.has(origin)) {
      const config = this.homey.settings.get(`controller:${origin}`);
      if (!config) throw Error('Par controlleren igen');
      this.clients.set(origin, new Client(origin, config.user, config.pass));
    }
    return this.clients.get(origin);
  }
  watch(d) {
    const origin = d.getStoreValue('origin');
    if (!this.groups.has(origin)) this.groups.set(origin, new Set());
    const group = this.groups.get(origin);
    group.add(d);
    if (group.size === 1) this.monitor(origin, group).catch(e => this.error(e.message));
  }
  unwatch(d) {
    const origin = d.getStoreValue('origin'), group = this.groups.get(origin);
    group?.delete(d);
    if (!group?.size) this.groups.delete(origin);
  }
  async monitor(origin, group) {
    let signature;
    while (group.size && !this.stopped) {
      try {
        const c = this.client(origin);
        const devices = [...group], ids = devices.map(d => d.getStoreValue('resource'));
        const current = `${ids.join(',')}:${c.cookie}`;
        const full = !signature || current !== signature;
        if (full) await c.subscribe(ids);
        const updates = full ? await c.snapshot(ids) : await c.changes();
        if (full) signature = `${ids.join(',')}:${c.cookie}`;
        for (const [n, v] of updates) {
          const d = devices.find(x => x.getStoreValue('resource') === n);
          if (d && group.has(d)) {
            try { await d.observe(v); } catch (e) { await d.setUnavailable(e.message); }
          }
        }
        if (full) for (const d of devices) {
          if (group.has(d) && !updates.some(([n]) => n === d.getStoreValue('resource')))
            await d.setUnavailable('Ressourcen blev ikke fundet');
        }
      } catch (e) {
        signature = null;
        await Promise.allSettled([...group].map(d => d.setUnavailable(e.message)));
        await new Promise(resolve => this.homey.setTimeout(resolve, 5000));
      }
    }
  }
  async onUninit() { this.stopped = true; }
};
