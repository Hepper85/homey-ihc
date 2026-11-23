'use strict';
const { XMLParser } = require('fast-xml-parser');
const { gunzipSync } = require('node:zlib');
const { setTimeout: delay } = require('node:timers/promises');
const { post } = require('./transport');
const parser = new XMLParser({ removeNSPrefix: true, parseTagValue: false });
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const resource = 'ResourceInteractionService';
const tag = (name, body) => `<${name} xmlns="utcs">${body}</${name}>`;
function id(value) {
  const s = String(value).trim().replace(/^_(?=0x)/i, '');
  if (!/^(?:\d+|0x[\da-f]+)$/i.test(s) || !Number.isSafeInteger(Number(s)) || Number(s) < 1 || Number(s) > 2147483647)
    throw Error('Ugyldigt IHC-ressource-id: ' + s);
  return Number(s);
}
function rows(result) {
  if (result == null) throw Error('Uventet IHC-svar');
  return [result.arrayItem || []].flat().flatMap(item => {
    const v = item.value || {};
    if (['true', 'false'].includes(v.value)) return [[id(item.resourceID), v.value === 'true']];
    const n = v.integer ?? v.floatingPointValue;
    return n !== undefined && n !== '' && Number.isFinite(Number(n)) ? [[id(item.resourceID), Number(n)]] : [];
  });
}
class Client {
  constructor(url, username, password) {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || u.pathname !== '/')
      throw Error('Angiv controllerens adresse, fx http://192.168.1.3');
    Object.assign(this, { origin: u.origin, username, password, cookie: '' });
  }
  async soap(service, action, body = '') {
    const r = await post(`${this.origin}/ws/${service}`,
      { SOAPAction: action, 'Content-Type': 'text/xml; charset=UTF-8', ...(this.cookie && { Cookie: this.cookie }) },
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><s:Body>${body}</s:Body></s:Envelope>`);
    if (r.status !== 200) throw Error(`IHC: ${action} (HTTP ${r.status})`);
    const cookies = r.cookies;
    if (cookies.length) this.cookie = cookies.map(c => c.split(';')[0]).join('; ');
    const result = parser.parse(r.text).Envelope?.Body;
    if (result == null || result.Fault) throw Error(`Controlleren afviste ${action}`);
    return result;
  }
  async login() {
    if (!this.loginTask) this.loginTask = (async () => {
      this.cookie = '';
      const r = await this.soap('AuthenticationService', 'authenticate', tag('authenticate1',
        `<password>${esc(this.password)}</password><username>${esc(this.username)}</username><application>treeview</application>`));
      if (r.authenticate2?.loginWasSuccessful !== 'true' || !this.cookie) throw Error('IHC-login mislykkedes');
    })().finally(() => { this.loginTask = null; });
    return this.loginTask;
  }
  async call(...args) {
    if (!this.cookie) await this.login();
    try { return await this.soap(...args); }
    catch (error) { this.cookie = ''; throw error; }
  }
  async project() {
    const r = await this.call('ControllerService', 'getIHCProject');
    if (!r.getIHCProject1?.data) throw Error('Controlleren returnerede intet projekt');
    return gunzipSync(Buffer.from(r.getIHCProject1.data, 'base64'), { maxOutputLength: 32 * 1024 * 1024 }).toString('latin1');
  }
  async subscribe(ids) {
    const list = ids.map(n => `<a:arrayItem>${id(n)}</a:arrayItem>`).join('');
    await this.call(resource, 'enableRuntimeValueNotifications', `<enableRuntimeValueNotifications1 xmlns="utcs" xmlns:a="http://www.w3.org/2001/XMLSchema">${list}</enableRuntimeValueNotifications1>`);
  }
  async snapshot(ids) {
    return rows((await this.call(resource, 'getResourceValues', tag('getRuntimeValues1', ids.map(n => `<arrayItem>${id(n)}</arrayItem>`).join('')))).getRuntimeValues2);
  }
  async changes() {
    // This operation deliberately uses getResourceValue as the SOAPAction.
    return rows((await this.call(resource, 'getResourceValue', tag('waitForResourceValueChanges1', '5'))).waitForResourceValueChanges2);
  }
  async write(n, kind, v) {
    const types = { bool: ['WSBooleanValue', 'value'], int: ['WSIntegerValue', 'integer'], float: ['WSFloatingPointValue', 'floatingPointValue'] };
    if (kind === 'bool' ? typeof v !== 'boolean' : !Number.isFinite(v) || (kind === 'int' && !Number.isSafeInteger(v))) throw Error('Ugyldig værdi');
    const [type, field] = types[kind];
    const r = await this.call(resource, 'setResourceValue', tag('setResourceValue1', `<value xmlns:a="utcs.values" xsi:type="a:${type}"><a:${field}>${v}</a:${field}></value><typeString/><resourceID>${id(n)}</resourceID><isValueRuntime>true</isValueRuntime>`));
    if (r.setResourceValue2 !== 'true') throw Error('IHC afviste skrivningen til ' + n);
  }
  async pulse(n) {
    await this.write(n, 'bool', true);
    await delay(100);
    await this.write(n, 'bool', false);
  }
}
module.exports = { Client, id };
