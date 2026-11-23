const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { gzipSync } = require('node:zlib');
const { Client } = require('../lib/ihc');
const { discover } = require('../lib/products');

test('Session, projektimport, notifikationer, typede skrivninger og udløbet session', async t => {
  const project = `<project><group name="Entré"><product_dataline product_identifier="_0x2109" name="Dør"><dataline_input id="_0x2a"/><dataline_input setting="yes" id="_0x33"/></product_dataline></group></project>`;
  let logins = 0, expire = false;
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let xml = ''; for await (const chunk of req) xml += chunk;
    const action = req.headers.soapaction;
    requests.push({ action, xml });
    let result;
    if (action === 'authenticate') {
      logins++;
      assert.match(xml, /<password>a&amp;b<\/password>/);
      res.setHeader('Set-Cookie', `JSESSIONID=${logins}; Path=/`);
      result = '<authenticate2><loginWasSuccessful>true</loginWasSuccessful></authenticate2>';
    } else {
      if (expire) { expire = false; res.writeHead(401).end(); return; }
      assert.equal(req.headers.cookie, `JSESSIONID=${logins}`);
      result = {
        getIHCProject: `<getIHCProject1><data>${gzipSync(Buffer.from(project, 'latin1')).toString('base64')}</data></getIHCProject1>`,
        enableRuntimeValueNotifications: '<enableRuntimeValueNotifications2/>',
        getResourceValues: '<getRuntimeValues2><arrayItem><resourceID>42</resourceID><value><v:value>false</v:value></value></arrayItem></getRuntimeValues2>',
        getResourceValue: '<waitForResourceValueChanges2><arrayItem><resourceID>42</resourceID><value><v:value>true</v:value></value></arrayItem></waitForResourceValueChanges2>',
        setResourceValue: '<setResourceValue2>true</setResourceValue2>'
      }[action];
    }
    res.end(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v="utcs.values"><s:Body>${result}</s:Body></s:Envelope>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const c = new Client(`http://127.0.0.1:${server.address().port}`, 'user', 'a&b');
  const devices = discover(c.origin, await c.project());
  assert.equal(devices.length, 1);
  assert.match(devices[0].name, /Entré · Dør/);
  assert.deepEqual(devices[0].capabilities, ['alarm_contact']);
  assert.equal(devices[0].store.invert, true);
  await c.subscribe([42]);
  assert.deepEqual(await c.snapshot([42]), [[42,false]]);
  assert.deepEqual(await c.changes(), [[42,true]]);
  await c.write(42, 'int', 50);
  assert.match(requests.at(-1).xml, /<a:integer>50</);
  await c.write(42, 'float', 12.25);
  assert.match(requests.at(-1).xml, /<a:floatingPointValue>12.25</);
  await c.pulse(42);
  assert.match(requests.at(-2).xml, /<a:value>true</);
  assert.match(requests.at(-1).xml, /<a:value>false</);
  expire = true;
  await assert.rejects(c.changes(), /401/);
  await c.subscribe([42]);
  assert.equal(logins, 2);
});
