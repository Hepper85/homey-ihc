const Homey = require('homey');
module.exports = class extends Homey.Device {
  async onInit() {
    this.spec = this.getStore();
    const { kind, resource, origin } = this.spec;
    const client = () => this.homey.app.client(origin);
    if (this.hasCapability('onoff')) this.registerCapabilityListener('onoff', async on => {
      const pulse = this.spec[on ? 'on' : 'off'];
      if (pulse) return client().pulse(pulse);
      if (kind === 'dimmer') return client().write(resource, 'int', on ? this.lastLevel || 100 : 0);
      return client().write(resource, 'bool', on);
    });
    if (this.hasCapability('dim')) this.registerCapabilityListener('dim', async v => client().write(resource, 'int', Math.round(100 * v)));
    await this.setUnavailable('Afventer IHC');
    this.homey.app.watch(this);
  }
  async observe(v) {
    const { kind, invert } = this.spec;
    if (kind === 'dimmer') {
      if (typeof v !== 'number' || v < 0 || v > 100) throw Error('Forventede et lysniveau på 0–100');
      if (v > 0) this.lastLevel = v;
      await this.setCapabilityValue('dim', v / 100);
      await this.setCapabilityValue('onoff', v > 0);
    } else {
      const cap = this.getCapabilities()[0];
      const bool = cap === 'onoff' || cap.startsWith('alarm_');
      if (typeof v !== (bool ? 'boolean' : 'number')) throw Error('Ressourcens datatype passer ikke til enheden');
      await this.setCapabilityValue(cap, bool && invert ? !v : v);
    }
    if (!this.getAvailable()) await this.setAvailable();
  }
  async onDeleted() { this.homey.app.unwatch(this); }
  async onUninit() { this.homey.app.unwatch(this); }
};
