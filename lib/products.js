const { XMLParser } = require('fast-xml-parser');
const { id } = require('./ihc');
const kinds = {
  light: ['light', 'onoff'], dimmer: ['light', 'onoff', 'dim'], switch: ['socket', 'onoff'],
  contact: ['sensor', 'alarm_contact'], motion: ['sensor', 'alarm_motion'], smoke: ['sensor', 'alarm_smoke'],
  moisture: ['sensor', 'alarm_water'], binary: ['sensor', 'alarm_generic'], temperature: ['sensor', 'measure_temperature'],
  humidity: ['sensor', 'measure_humidity'], lux: ['sensor', 'measure_luminance'], number: ['sensor', 'ihc_number']
};
// Product identifiers and resource tags from HA's ihc_auto_setup.yaml.
const rules = {};
function rule(products, node, kind, extra = {}) {
  for (const product of products.split(' ')) (rules[product] ||= []).push({ node, kind, ...extra });
}
rule('4301 4302 4303 4304 4305 4306 4307 4308 4401 4402 4406 4410', 'airlink_dimming', 'dimmer');
rule('4202 4403 4404', 'airlink_relay', 'light');
rule('4201 4203 4204', 'airlink_relay', 'switch');
rule('2201', 'dataline_output', 'switch');
rule('2202', 'dataline_output', 'light');
rule('2109', 'dataline_input', 'contact', { invert: true });
rule('210e 0', 'dataline_input', 'motion', { first: true });
rule('210f', 'dataline_input', 'motion');
rule('210a', 'dataline_input', 'smoke');
rule('210c', 'dataline_input', 'moisture');
rule('2110', 'dataline_input', 'binary');
rule('2124 2135 2136', 'resource_temperature', 'temperature');
rule('2135', 'resource_humidity_level', 'humidity');
rule('2136', 'resource_light', 'lux');
function device(origin, spec) {
  if (!Object.hasOwn(kinds, spec.kind)) throw Error('Ukendt enhedstype');
  const n = id(spec.resource), [cls, ...capabilities] = kinds[spec.kind];
  return { name: spec.name?.trim() || `IHC ${n}`, class: cls, capabilities, data: { id: `${origin}#${n}` },
    store: { origin, resource: n, kind: spec.kind, invert: spec.invert === true,
      on: spec.on ? id(spec.on) : null, off: spec.off ? id(spec.off) : null } };
}
function discover(origin, xml) {
  const tree = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xml);
  const found = new Map();
  function walk(key, obj, group) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(o => walk(key, o, group)); return; }
    if (key === 'group') group = obj['@_name'] || '';
    const code = String(obj['@_product_identifier']).toLowerCase().replace(/^_0x/, '');
    if (['product_airlink', 'product_dataline', 'rs485_led_dimmer_channel'].includes(key)) {
      for (const r of rules[code] || []) {
        const nodes = [obj[r.node] || []].flat();
        for (const node of r.first ? nodes.slice(0, 1) : nodes) {
          if (!node['@_id'] || node['@_setting'] === 'yes') continue;
          const resource = id(node['@_id']);
          found.set(resource, device(origin, { ...r, resource,
            name: [group, obj['@_name'], node['@_name'], `(${resource})`].filter(Boolean).join(' · ') }));
        }
      }
    }
    Object.entries(obj).forEach(([k,v]) => walk(k,v,group));
  }
  walk('',tree,'');
  return [...found.values()];
}
module.exports = { discover, device, kinds };
