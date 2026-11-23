const Homey = require('homey');
const { Client } = require('../../lib/ihc');
const { discover, device } = require('../../lib/products');
module.exports = class extends Homey.Driver {
  async onPair(session) {
    let result = [];
    session.setHandler('configure', async form => {
      const c = new Client(form.url.trim(), form.user, form.pass);
      await c.login();
      if (!form.manual) result = discover(c.origin, await c.project());
      else {
        const d = device(c.origin, form);
        const rows = await c.snapshot([d.store.resource]);
        if (!rows.some(([n]) => n === d.store.resource)) throw Error('IHC kunne ikke læse dette ressource-id');
        result = [d];
      }
      this.homey.app.remember(c);
      return result.length;
    });
    session.setHandler('list_devices', async () => result);
  }
};
