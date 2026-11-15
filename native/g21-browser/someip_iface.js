// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Yousaf Khan (Vizualyse/idrive-apps: tools/someip_iface.py and the schemaGen of
// platform/tool/speakers/1.0.0/speakers.js); put into one JavaScript module for G21 Input, with fields and events.
'use strict';
/**
 * The head unit's SOME/IP catalog (/etc/oap/someip/someip-interfaces.json) -> the interface JSON
 * /usr/lib/someip.node takes (the format of /usr/lib/oap-mainapp/src-gen): methods, fields (getter, setter,
 * notifier) and events. For root tools on the head unit's Node 8; no BMW definitions are shipped.
 *
 *   const iface = require('./someip_iface.js').generator(catalog);   // catalog: the parsed JSON
 *   const cfg = iface('de.bmw.infotainment.ControllerElements');
 */
const PRIM = ['UInt8', 'UInt16', 'UInt32', 'UInt64', 'Int8', 'Int16', 'Int32', 'Int64', 'Boolean', 'Float', 'Double',
    'Utf8D', 'Utf16D', 'Utf8', 'Utf16', 'ByteBuffer'];

function generator(cat) {
    const types = cat.datatypes;
    function array(d) {
        // a fixed-length array (arrayLengthWidth 0) is someip.node's ArrayF
        if (d.arrayLengthWidth === 0 && d.arrayMaxLength !== undefined) return { t: 'ArrayF', l: d.arrayMaxLength };
        const o = { t: 'ArrayD' };
        if (d.arrayLengthWidth !== undefined && d.arrayLengthWidth !== 4) o.lw = d.arrayLengthWidth;
        if (d.arrayMinLength !== undefined) o.nl = d.arrayMinLength;
        if (d.arrayMaxLength !== undefined) o.xl = d.arrayMaxLength;
        return o;
    }
    function items(d) {
        const out = {};
        if (d.extends && types[d.extends]) Object.assign(out, items(types[d.extends]));
        return Object.assign(out, d.items);
    }
    function typ(ref) {
        if (PRIM.indexOf(ref) >= 0 || !types[ref]) {
            const o = { t: ref };
            if (ref === 'Utf16D' || ref === 'Utf16') o.bo = true;
            return o;
        }
        const d = types[ref];
        switch (d.type) {
        case 'typedef': return typ(d.dataRef);
        case 'enum': {
            const o = { t: 'Enum' };
            if (d.enumWidth !== undefined) o.w = d.enumWidth;
            o.e = items(d);
            return o;
        }
        case 'struct': return { t: 'Struct', e: d.members.map(named) };
        case 'array': { const o = array(d); o.e = typ(d.dataRef); return o; }
        case 'map': return { t: 'Map', k: mapped(d.keyDataRef), v: mapped(d.valueDataRef) };
        case 'union': return { t: 'Union', e: d.members.map(named) };
        default: throw new Error('type ' + d.type);
        }
    }
    function mapped(ref) {
        const o = typ(ref);
        if (types[ref] && (types[ref].type === 'array' || types[ref].type === 'typedef')) return Object.assign({ n: types[ref].name }, o);
        return o;
    }
    function named(m) {
        const o = { n: m.name };
        if (m.defaultValue !== undefined) o.d = m.defaultValue;
        let t = typ(m.dataRef);
        if (m.dimension) { const a = array(m); a.e = t; t = a; }
        Object.assign(o, t);
        if (m.bitWidth !== undefined) o.bw = m.bitWidth;
        return o;
    }
    function struct(args) { return args && args.length ? { t: 'Struct', e: args.map(named) } : {}; }
    return function iface(name) {
        const i = cat.interfaces[name];
        if (!i) throw new Error('the catalog has no ' + name);
        const out = { name: i.name, serviceId: i.serviceId, version: i.version, instances: (cat.instanceIDs || {})[name] || {}, methods: {} };
        Object.keys(i.methods || {}).forEach((mn) => {
            const m = i.methods[mn];
            const o = { id: m.methodId, schema: struct(m.inputs || []) };
            if (m.outputs) o.retSchema = struct(m.outputs);
            if (m.reliable) o.reliable = true;
            out.methods[mn] = o;
        });
        const fields = {};
        Object.keys(i.fields || {}).forEach((fn) => {
            const f = i.fields[fn];
            const o = { schema: mapped(f.dataRef) };
            ['getter', 'setter'].forEach((k) => { if (f[k]) o[k] = { id: f[k].id }; });
            if (f.notifier) {
                const e = { id: f.notifier.id, groups: f.notifier.eventgroups || [] };
                if (f.notifier.reliable) e.reliable = true;
                o.event = e;
            }
            fields[fn] = o;
        });
        if (Object.keys(fields).length) out.fields = fields;
        const events = {};
        const src = i.events || i.broadcasts || {};
        Object.keys(src).forEach((en) => {
            const e = src[en];
            const o = { id: e.eventId, groups: e.eventgroups || [], schema: struct(e.outputs || []) };
            if (e.selective) o.selective = true;
            if (e.reliable) o.reliable = true;
            events[en] = o;
        });
        if (Object.keys(events).length) out.events = events;
        return out;
    };
}

module.exports = { generator: generator };
